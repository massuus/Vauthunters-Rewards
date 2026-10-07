import { execFile } from 'node:child_process';
import process from 'node:process';
import { readFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';

export function collectChannel(directory, results, streamer, signal) {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/timeout',
      [
        '-k',
        '5',
        '150',
        process.execPath,
        join(directory, 'collect.mjs'),
        '--streamer',
        streamer,
        '--storage-state',
        join(directory, '.auth/state.json'),
        '--output',
        join(results, `${streamer}.json`),
      ],
      { cwd: directory, maxBuffer: 128 * 1024, signal },
      (error, stdout) => {
        try {
          const raw = JSON.parse(stdout.trim());
          if (
            !['collected', 'failed', 'skipped'].includes(raw.status) ||
            (error && raw.status === 'collected')
          )
            throw new Error();
          const safe = { status: raw.status };
          if (/^[a-z-]{1,80}$/.test(raw.code || '')) safe.code = raw.code;
          for (const key of [
            'players',
            'pages',
            'skipped',
            'socketBytes',
            'browserBytes',
            'requests',
            'blocked',
            'elapsedMs',
          ]) {
            if (Number.isFinite(raw[key]) && raw[key] >= 0) safe[key] = raw[key];
          }
          if (['present', 'missing', 'unknown'].includes(raw.diagnostics?.companionState))
            safe.companionState = raw.diagnostics.companionState;
          resolve(safe);
        } catch {
          resolve({ status: 'failed', code: 'collector-no-result' });
        }
      }
    );
  });
}

export async function uploadSnapshot({
  results,
  streamer,
  token,
  endpoint,
  dryRun = false,
  fetchImpl = fetch,
}) {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/companion-sync'
  )
    throw new Error('Invalid sync endpoint.');
  const filePath = join(results, `${streamer}.json`);
  if ((await stat(filePath)).size > 2 * 1024 * 1024)
    return { status: 'failed', code: 'upload-too-large', permanent: true };
  const file = await readFile(filePath, 'utf8');
  if (Buffer.byteLength(file) > 2 * 1024 * 1024)
    return { status: 'failed', code: 'upload-too-large', permanent: true };
  const snapshot = JSON.parse(file);
  if (snapshot.streamer !== streamer) throw new Error('Wrong snapshot.');
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...snapshot, dryRun }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return {
      status: 'failed',
      code: `upload-http-${response.status}`,
      permanent:
        response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status),
    };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error('Invalid import response.');
    }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const result = JSON.parse(text);
  if (
    !['imported', 'already-imported', 'validated'].includes(result.status) ||
    result.streamer !== streamer ||
    result.players !== snapshot.players.length
  )
    throw new Error('Invalid import response.');
  return {
    status: result.status,
    players: result.players,
    ...(Number.isSafeInteger(result.changed) ? { changed: result.changed } : {}),
  };
}
