import { sql } from '../core/database';

export interface ScrapedItem {
  id: string;
  url: string;
  is_live: boolean;
}

export const livestreamsRepo = {
  async list(opts: { groupId?: string; liveOnly?: boolean; limit?: number }) {
    const rows = await sql()`
      SELECT l.id, l.video_id, l.url, l.is_live, l.first_seen_at, l.last_seen_at,
             g.id AS group_id, g.name AS group_name
      FROM livestream l JOIN facebook_group g ON g.id = l.group_id
      WHERE (${opts.groupId ?? null}::uuid IS NULL OR l.group_id = ${opts.groupId ?? null}::uuid)
        AND (${opts.liveOnly ?? false} = false OR l.is_live)
      ORDER BY l.first_seen_at DESC
      LIMIT ${opts.limit ?? 500}`;
    return rows.map((r) => ({
      id: r.id,
      videoId: r.video_id,
      url: r.url,
      isLive: r.is_live,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      groupId: r.group_id,
      groupName: r.group_name,
    }));
  },

  /** Inserts new URLs, refreshes last_seen_at on known ones. Returns how many were new. */
  async upsertMany(groupId: string, items: ScrapedItem[]): Promise<number> {
    if (!items.length) return 0;
    const rows = await sql()`
      INSERT INTO livestream (group_id, video_id, url, is_live)
      SELECT ${groupId}::uuid, x.id, x.url, x.is_live
      FROM jsonb_to_recordset(${JSON.stringify(items)}::text::jsonb) AS x(id text, url text, is_live boolean)
      ON CONFLICT (group_id, video_id) DO UPDATE
        SET last_seen_at = now(), is_live = livestream.is_live OR EXCLUDED.is_live
      RETURNING (xmax = 0) AS inserted`;
    return rows.filter((r) => r.inserted).length;
  },
};
