import { sql } from '../core/database';

export const runsRepo = {
  async start(groupId: string): Promise<string> {
    const [row] = await sql()`INSERT INTO scrape_run (group_id) VALUES (${groupId}) RETURNING id`;
    return row!.id;
  },

  async finish(id: string, r: { status: 'done' | 'failed'; found?: number; added?: number; error?: string }) {
    await sql()`
      UPDATE scrape_run SET status = ${r.status}, found_count = ${r.found ?? 0}, new_count = ${r.added ?? 0},
        error = ${r.error ?? null}, finished_at = now()
      WHERE id = ${id}`;
  },

  async recent(limit = 20) {
    const rows = await sql()`
      SELECT r.*, g.name AS group_name FROM scrape_run r JOIN facebook_group g ON g.id = r.group_id
      ORDER BY r.started_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: r.group_name,
      status: r.status,
      foundCount: r.found_count,
      newCount: r.new_count,
      error: r.error,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }));
  },

  /** A crash mid-run would leave rows stuck on 'running'; close them at startup. */
  async failStale() {
    await sql()`UPDATE scrape_run SET status = 'failed', error = 'interrupted', finished_at = now() WHERE status = 'running'`;
  },
};
