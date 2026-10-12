import { Hono } from 'hono';
import { livestreamsRepo } from '../repositories/livestreams';

export const livestreams = new Hono();

livestreams.get('/', async (c) => {
  const { groupId, liveOnly } = c.req.query();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (groupId && !uuid.test(groupId)) return c.json({ error: 'Invalid groupId' }, 400);
  return c.json(await livestreamsRepo.list({ groupId: groupId || undefined, liveOnly: liveOnly === 'true' }));
});
