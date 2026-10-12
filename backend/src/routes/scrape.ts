import { Hono } from 'hono';
import { z } from 'zod';
import { runsRepo } from '../repositories/runs';
import { progress, startScrape } from '../services/scraper';

export const scrape = new Hono();

// Body: { groupIds?: string[] } -- omit to scrape every active group
scrape.post('/', async (c) => {
  const body = z.object({ groupIds: z.array(z.string().uuid()).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Invalid body' }, 400);
  if (progress.running) return c.json({ error: 'A scrape is already running' }, 409);
  const result = await startScrape(body.data.groupIds);
  if (!result.started) return c.json({ error: 'No active groups to scrape' }, 400);
  return c.json(result, 202);
});

scrape.get('/status', (c) => c.json(progress));
scrape.get('/runs', async (c) => c.json(await runsRepo.recent()));
