import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession, getAuthSession, sanitizeReturnPath } from '../functions/utils/auth.js';
import { onRequest as miningClosed } from '../functions/api/mining/_middleware.js';

test('only configured admin Twitch IDs can create sessions, before any database or token writes', async () => {
  for (const env of [{}, { ADMIN_TWITCH_USER_IDS: '123' }]) {
    await assert.rejects(
      createAuthSession(env, { twitchUserId: '999', login: 'massuus' }, {}),
      (error) => error.status === 403
    );
  }
  await assert.rejects(
    createAuthSession({ ADMIN_TWITCH_USER_IDS: '123' }, { twitchUserId: '123' }, {}),
    (error) => error.status !== 403,
    'Configured admin proceeds to normal database/config validation'
  );
});

test('existing non-admin sessions are invalidated before Twitch revalidation', async () => {
  const writes = [];
  const env = {
    ADMIN_TWITCH_USER_IDS: '123',
    LEADERBOARD_DB: {
      prepare(sql) {
        return {
          bind(value) {
            return {
              async first() {
                return { twitch_user_id: '999', expires_at: '2099-01-01T00:00:00Z' };
              },
              async run() {
                writes.push({ sql, value });
              },
            };
          },
        };
      },
    },
  };
  assert.equal(
    await getAuthSession(
      new Request('https://example.test/api/auth/me', {
        headers: { cookie: 'vhr_session=old-session' },
      }),
      env
    ),
    null
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /DELETE FROM auth_sessions/);
});

test('OAuth returns only to admin, including old mining return links', () => {
  for (const path of [
    '',
    '/?mining',
    '//evil.test',
    '/admin/../../?mining',
    '/administer',
    '/admin\n',
  ])
    assert.equal(sanitizeReturnPath(path), '/admin');
  assert.equal(sanitizeReturnPath('/admin'), '/admin');
  assert.equal(sanitizeReturnPath('/admin?tab=health'), '/admin?tab=health');
});

test('all retired mining API paths stop at 410 without querying data or sending Discord messages', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = miningClosed({
      request: new Request('https://example.test/api/mining/submissions', { method }),
      next() {
        throw new Error('Retired endpoints must not run');
      },
    });
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match((await response.json()).error, /event has ended/);
  }
});
