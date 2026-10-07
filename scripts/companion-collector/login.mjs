import process from 'node:process';
import { spawn } from 'node:child_process';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { manualEdgeArgs, twitchOnlyState, hasTwitchSession } from './login-state.mjs';

// A dedicated profile only. Never attach to or read the user's regular Edge profile.
const authDir = join(dirname(fileURLToPath(import.meta.url)), '.auth');
const profileDir = join(authDir, 'manual-edge');
const { values } = parseArgs({ options: { output: { type: 'string' } } });
const statePath = values.output ? resolve(values.output) : join(authDir, 'state.json');
let context;
let terminal;
let stage = 'preflight';

try {
  if (process.platform !== 'win32') throw new Error('windows-required');
  if (!process.stdin.isTTY) throw new Error('interactive-terminal-required');
  const exists = await access(statePath).then(
    () => true,
    () => false
  );
  if (exists) throw new Error('state-already-exists');
  const candidates = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
    process.env.LOCALAPPDATA,
  ]
    .filter(Boolean)
    .map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  let edge;
  for (const candidate of candidates) {
    if (
      await stat(candidate).then(
        (file) => file.isFile(),
        () => false
      )
    ) {
      edge = candidate;
      break;
    }
  }
  if (!edge) throw new Error('edge-not-found');
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  process.stdout.write(
    '\nOpening a normal Edge window with a separate collector profile.\n' +
      '1. Sign in to Twitch yourself. This window is NOT controlled by Playwright.\n' +
      '2. Close that collector Edge window after you are signed in. Leave your usual browser alone.\n' +
      '3. Return here and press Enter to save the session.\n\n' +
      'If sign-in fails, press Ctrl+C here instead. Video is not blocked during this manual step.\n'
  );
  stage = 'manual-browser';
  const child = spawn(edge, manualEdgeArgs(profileDir), { stdio: 'ignore', windowsHide: false });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  await terminal.question('After signing in and closing the collector window, press Enter: ');
  terminal.close();
  terminal = undefined;

  stage = 'open-saved-profile';
  process.stdout.write(
    'Reading the session from the collector profile. No password entry is needed now.\n'
  );
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: edge,
    headless: true,
    timeout: 30_000,
    serviceWorkers: 'block',
  });
  if (!hasTwitchSession(await context.cookies())) throw new Error('no-twitch-session');
  stage = 'save-session';
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const blocked =
      request.resourceType() === 'media' ||
      /(^|\.)ttvnw\.net$/.test(url.hostname) ||
      /\.(m3u8|mpd|mp4|m4s|ts|aac)$/i.test(url.pathname);
    return blocked ? route.abort() : route.continue();
  });
  // Visiting the origin makes its existing localStorage available to storageState.
  // This is not a login attempt or a test of the companion connection.
  const page = await context.newPage();
  await page.goto('https://www.twitch.tv/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const state = twitchOnlyState(await context.storageState());
  if (!hasTwitchSession(state.cookies)) throw new Error('no-twitch-session');
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  process.stdout.write(
    values.output
      ? 'New login saved privately. Continuing with the secure Oracle transfer...\n'
      : 'Saved .auth/state.json. The Oracle companion connection still needs testing.\n' +
          'Tell the assistant it was saved; do not paste the file contents.\n'
  );
} catch (error) {
  const messages = {
    'windows-required': 'This manual login helper currently requires Windows and Microsoft Edge.',
    'interactive-terminal-required': 'Run npm run login directly in your PowerShell window.',
    'state-already-exists':
      'A saved session already exists. It was not overwritten; tell the assistant before retrying.',
    'edge-not-found': 'Microsoft Edge was not found in its usual installation locations.',
    'no-twitch-session':
      'No signed-in Twitch session was found in the collector profile. Run npm run login again and complete sign-in in that window.',
  };
  // Never print browser errors: they can include authentication-bearing URLs.
  process.stderr.write(
    `${
      messages[error.message] ||
      (stage === 'open-saved-profile'
        ? 'Could not open the collector profile. Close its Edge windows, then retry. Do not close your regular browser.'
        : `Setup could not complete (${stage}). No existing session file was overwritten.`)
    }\n`
  );
  process.exitCode = 1;
} finally {
  terminal?.close();
  await context?.close().catch(() => {});
}
