import { Hono } from 'hono';
import { z } from 'zod';
import { groupsRepo } from '../repositories/groups';

const groupUrl = z
  .string()
  .trim()
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return /(^|\.)facebook\.com$/i.test(u.hostname) && /^\/groups\/[^/]+/.test(u.pathname);
    } catch {
      return false;
    }
  }, 'Must be a facebook.com/groups/... URL')
  // Normalise to https://www.facebook.com/groups/<id-or-name> so duplicates are caught
  .transform((v) => `https://www.facebook.com/groups/${new URL(v).pathname.split('/')[2]}`);

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: groupUrl,
  scrolls: z.number().int().min(1).max(500).default(30),
  liveOnly: z.boolean().default(false),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  scrolls: z.number().int().min(1).max(500).optional(),
  liveOnly: z.boolean().optional(),
});

export const groups = new Hono();

groups.get('/', async (c) => c.json(await groupsRepo.list()));

groups.post('/', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
  try {
    return c.json(await groupsRepo.create(parsed.data), 201);
  } catch (e: any) {
    if (e?.code === '23505') return c.json({ error: 'That group is already added' }, 409);
    throw e;
  }
});

groups.patch('/:id', async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
  const row = await groupsRepo.update(c.req.param('id'), parsed.data);
  return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
});

groups.delete('/:id', async (c) =>
  (await groupsRepo.remove(c.req.param('id'))) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404),
);
