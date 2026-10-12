import { sql } from '../core/database';

export interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  scrolls: number;
  liveOnly: boolean;
  lastScrapedAt: string | null;
  createdAt: string;
  livestreamCount?: number;
}

const map = (r: any): FacebookGroup => ({
  id: r.id,
  name: r.name,
  url: r.url,
  isActive: r.is_active,
  scrolls: r.scrolls,
  liveOnly: r.live_only,
  lastScrapedAt: r.last_scraped_at,
  createdAt: r.created_at,
  livestreamCount: r.livestream_count === undefined ? undefined : Number(r.livestream_count),
});

export const groupsRepo = {
  async list() {
    const rows = await sql()`
      SELECT g.*, (SELECT count(*) FROM livestream l WHERE l.group_id = g.id) AS livestream_count
      FROM facebook_group g ORDER BY g.created_at DESC`;
    return rows.map(map);
  },

  async get(id: string) {
    const [row] = await sql()`SELECT * FROM facebook_group WHERE id = ${id}`;
    return row ? map(row) : null;
  },

  async create(d: { name: string; url: string; scrolls: number; liveOnly: boolean }) {
    const [row] = await sql()`
      INSERT INTO facebook_group (name, url, scrolls, live_only)
      VALUES (${d.name}, ${d.url}, ${d.scrolls}, ${d.liveOnly}) RETURNING *`;
    return map(row);
  },

  async update(id: string, d: Partial<{ name: string; isActive: boolean; scrolls: number; liveOnly: boolean }>) {
    const [row] = await sql()`
      UPDATE facebook_group SET
        name = COALESCE(${d.name ?? null}, name),
        is_active = COALESCE(${d.isActive ?? null}, is_active),
        scrolls = COALESCE(${d.scrolls ?? null}, scrolls),
        live_only = COALESCE(${d.liveOnly ?? null}, live_only),
        updated_at = now()
      WHERE id = ${id} RETURNING *`;
    return row ? map(row) : null;
  },

  async remove(id: string) {
    const rows = await sql()`DELETE FROM facebook_group WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  },

  async markScraped(id: string) {
    await sql()`UPDATE facebook_group SET last_scraped_at = now() WHERE id = ${id}`;
  },
};
