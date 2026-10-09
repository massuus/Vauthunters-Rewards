import { validateSocketUrl } from '../socket.mjs';
import { JoinError } from './auth.mjs';

// Only presence registration is writable. No spells, purchases, votes or other actions.
const REQUESTS = new Set(['requestCompanion', 'requestTriggerPresence']);
export class PresenceConnection {
  constructor(
    url,
    streamer,
    {
      WebSocketImpl = WebSocket,
      onPresence = () => {},
      onReady = () => {},
      onVaultState = () => {},
      onCompanion = () => {},
      onClose = () => {},
      onBytes = () => true,
      requestTimeout = 10_000,
    } = {}
  ) {
    this.ready = false;
    this.presence = null;
    this.online = null;
    this.companion = null;
    this.pending = new Map();
    this.nextId = 1;
    this.requestTimeout = requestTimeout;
    this.onClose = onClose;
    this.socket = new WebSocketImpl(validateSocketUrl(url, streamer));
    this.timer = setTimeout(() => this.close('connection-timeout'), 25_000);
    this.socket.addEventListener('error', () => this.close('socket-disconnected'));
    this.socket.addEventListener('close', () => this.close('socket-disconnected'));
    this.socket.addEventListener('message', (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 1024 * 1024)
          return this.close('response-limit');
        const message = event.data;
        if (!onBytes(new TextEncoder().encode(message).length)) return this.close('resource-limit');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.close('heartbeat-timeout'), 90_000);
        if (message.startsWith('0')) return this.send('40/extension,');
        if (message.startsWith('2')) return this.send(`3${message.slice(1)}`);
        if (message.startsWith('44/extension')) return this.close('extension-access-required');
        if (message.startsWith('41/extension') || message === '1')
          return this.close('socket-disconnected');
        const ack = message.match(/^43\/extension,(\d+)(\[.*\])$/s);
        if (ack) {
          const pending = this.pending.get(Number(ack[1]));
          if (pending) {
            this.pending.delete(Number(ack[1]));
            clearTimeout(pending.timer);
            pending.resolve(JSON.parse(ack[2])[0]);
          }
          return;
        }
        const packet = message.match(/^42\/extension,(?:\d+)?(\[.*\])$/s);
        if (!packet) return;
        const [name, value] = JSON.parse(packet[1]);
        if (name === 'authenticated' && !this.ready) {
          this.ready = true;
          onReady();
        }
        if (name === 'vhsmpStatus') this.online = value === true || value === 1;
        if (name === 'showPresenceCheck' && [0, 1].includes(value)) {
          this.presence = value === 1;
          onPresence(this.presence);
        }
        if (name === 'updateActiveVaultPresence' && [0, 1].includes(value?.presence))
          onVaultState(value.presence === 1);
        if (name === 'updateCompanion' && value && typeof value === 'object') {
          const previous = this.companion;
          this.companion = { ...this.companion, ...value };
          onCompanion(this.companion, previous);
        }
        if (name === 'resetCompanion') this.companion = null;
      } catch {
        this.close('invalid-socket-data');
      }
    });
  }
  send(message) {
    if (this.closed) throw new JoinError('socket-disconnected');
    try {
      this.socket.send(message);
    } catch {
      throw new JoinError('socket-disconnected');
    }
  }
  request(name) {
    if (!REQUESTS.has(name)) return Promise.reject(new JoinError('request-not-allowed'));
    if (!this.ready || this.closed) return Promise.reject(new JoinError('socket-disconnected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JoinError('request-timeout'));
      }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(`42/extension,${id}${JSON.stringify([name])}`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async readCompanion() {
    const value = await this.request('requestCompanion');
    if (value === 0) {
      this.companion = null;
      return null;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.activeThisVault !== 'boolean' ||
      typeof value.state !== 'string'
    )
      throw new JoinError('invalid-companion');
    this.companion = value;
    return value;
  }
  close(code = 'socket-disconnected') {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    clearTimeout(this.timer);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new JoinError(code));
    }
    this.pending.clear();
    try {
      this.socket.close(1000, 'finished');
    } catch {
      /* Already closed. */
    }
    this.onClose(code);
  }
}
