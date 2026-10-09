import { setTimeout as delay } from 'node:timers/promises';

export class JoinCoordinator {
  constructor({
    state,
    save,
    getConnection,
    sendChat,
    notify,
    now = Date.now,
    wait = delay,
    cooldownMs = 20 * 60_000,
    passive = false,
    changed = () => {},
  }) {
    Object.assign(this, {
      state,
      save,
      getConnection,
      sendChat,
      notify,
      now,
      wait,
      cooldownMs,
      passive,
      changed,
    });
    this.busy = new Set();
  }
  channel(name) {
    return (this.state.channels[name] ||= {});
  }
  persist() {
    this.save();
    this.changed();
  }
  presence(name, open) {
    const c = this.channel(name);
    if (open && !c.open) {
      // A recent write belongs to this window after a reconnect. Preserve its
      // result so an uncertain socket write can never be sent a second time.
      const recentAction = c.lastAction && this.now() - c.lastAction.at < this.cooldownMs;
      c.window = {
        openedAt: this.now(),
        outcome: recentAction ? c.lastAction.outcome : 'waiting',
      };
    }
    c.open = open;
    this.persist();
    if (open) return this.join(name);
  }
  async chat(name) {
    const c = this.channel(name);
    const connection = this.getConnection(name);
    // Healthy extension state is authoritative; a support/doubt chat burst is not a new vault.
    if (connection?.ready && connection.presence !== null) {
      if (!connection.presence) return;
      return this.join(name);
    }
    if (this.busy.has(name) || (c.lastAction && this.now() - c.lastAction.at < this.cooldownMs))
      return;
    if (this.passive) return;
    this.busy.add(name);
    try {
      await this.chatSend(name, c);
    } finally {
      this.busy.delete(name);
    }
  }
  async chatSend(name, c) {
    c.lastAction = { at: this.now(), method: 'chat', outcome: 'sending' };
    if (c.open && c.window) c.window.outcome = 'chat-sent';
    this.persist(); // Durable intent before any external send; a restart must not repeat it.
    try {
      await this.sendChat(name);
      c.lastAction.outcome = 'chat-sent';
    } catch {
      c.lastAction.outcome = 'chat-failed';
    }
    this.persist();
    await this.notice(name, c);
  }
  async notice(name, c) {
    if (!c.lastAction || c.lastAction.notified) return;
    c.lastAction.notified = true;
    this.persist();
    try {
      await this.notify(name);
    } catch {
      c.notificationFailed = true;
      this.persist();
    }
  }
  async join(name) {
    const c = this.channel(name);
    const connection = this.getConnection(name);
    if (!c.open || !c.window || !connection?.ready || this.busy.has(name)) return;
    this.busy.add(name);
    const window = c.window;
    try {
      const companion = await connection.readCompanion();
      if (c.window !== window || !c.open || connection.presence === false) return;
      if (!companion) {
        c.issue = 'no-companion';
        this.persist();
        return;
      }
      if (companion.activeThisVault) {
        c.issue = null;
        window.outcome = 'confirmed';
        if (c.lastAction && c.lastAction.at >= window.openedAt) {
          c.lastAction.outcome = 'confirmed';
          c.lastAction.confirmedAt = this.now();
        }
        this.persist();
        return;
      }
      if (companion.state === 'UNDEAD') {
        c.issue = 'companion-unavailable';
        this.persist();
        return;
      }
      if (connection.online === false) {
        c.issue = 'game-offline';
        this.persist();
        return;
      }
      if (window.outcome !== 'waiting') return;
      if (this.passive) {
        c.issue = 'passive-window-observed';
        this.persist();
        return;
      }
      // Querying may have taken time; never use an old connection after reconnect.
      if (this.getConnection(name) !== connection || !connection.ready) return;
      window.outcome = 'sending';
      c.lastAction = { at: this.now(), method: 'socket', outcome: 'sending' };
      c.issue = null;
      this.persist();
      try {
        await connection.request('requestTriggerPresence');
      } catch {
        /* Read back even if the ACK was lost. */
      }
      let confirmed = false;
      for (let i = 0; i < 3; i++) {
        if (i) await this.wait(1500);
        if (!connection.ready) break;
        try {
          confirmed = (await connection.readCompanion())?.activeThisVault === true;
        } catch {
          break;
        }
        if (confirmed) break;
      }
      window.outcome = confirmed ? 'confirmed' : 'unconfirmed';
      c.lastAction.outcome = window.outcome;
      if (confirmed) c.lastAction.confirmedAt = this.now();
      else c.issue = 'join-unconfirmed';
      this.persist();
      // An uncertain write is never blindly repeated through chat.
      await this.notice(name, c);
    } catch {
      c.issue = 'socket-read-failed';
      this.persist();
      // No write was attempted: a chat burst can still use the original fallback.
    } finally {
      this.busy.delete(name);
    }
  }
}
