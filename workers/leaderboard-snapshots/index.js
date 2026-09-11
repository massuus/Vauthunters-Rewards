import { DurableObject } from 'cloudflare:workers';
import { publishSnapshots, pruneSnapshots } from './publish.js';

export class SnapshotPublisher extends DurableObject {
  async refresh() {
    const token = crypto.randomUUID();
    const acquired = await this.ctx.storage.transaction(async (transaction) => {
      const lease = await transaction.get('lease');
      if (lease && lease.until > Date.now()) return false;
      await transaction.put('lease', { token, until: Date.now() + 14 * 60 * 1000 });
      return true;
    });
    if (!acquired) return { changed: false, busy: true };
    try {
      const result = await publishSnapshots(this.env);
      console.info(JSON.stringify({ event: 'leaderboard-snapshot', ...result }));
      await pruneSnapshots(this.env.LEADERBOARD_SNAPSHOTS);
      return result;
    } finally {
      await this.ctx.storage.transaction(async (transaction) => {
        const lease = await transaction.get('lease');
        if (lease?.token === token) await transaction.delete('lease');
      });
    }
  }
}

export default {
  async scheduled(_event, env) {
    await env.PUBLISHER.getByName('leaderboards').refresh();
  },
};
