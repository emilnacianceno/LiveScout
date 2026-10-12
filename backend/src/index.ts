import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './config/env';
import { getDatabase } from './core/database';
import { runsRepo } from './repositories/runs';
import { groups } from './routes/groups';
import { livestreams } from './routes/livestreams';
import { scrape } from './routes/scrape';

const api = new Hono().basePath('/api');
api.use('*', cors());

api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
api.get('/health/database', async (c) => {
  const connected = await getDatabase().testConnection();
  return c.json({ status: connected ? 'ok' : 'error', database: connected ? 'connected' : 'unavailable' }, connected ? 200 : 503);
});
api.route('/groups', groups);
api.route('/livestreams', livestreams);
api.route('/scrape', scrape);
api.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

if (await getDatabase().testConnection()) await runsRepo.failStale();
else console.warn('[backend] Database unreachable. Check DATABASE_URL and run `bun run db:migrate`.');

console.log(`[backend] http://localhost:${env.port}`);
export default { port: env.port, fetch: api.fetch };
