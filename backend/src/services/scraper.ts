import { resolve } from 'node:path';
import { env } from '../config/env';
import { groupsRepo, type FacebookGroup } from '../repositories/groups';
import { livestreamsRepo, type ScrapedItem } from '../repositories/livestreams';
import { runsRepo } from '../repositories/runs';

const EXPORT_FILE = resolve(import.meta.dir, '../../../data/livestreams.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const progress = {
  running: false,
  currentGroup: null as string | null,
  queued: 0,
  log: [] as string[],
};

async function py(path: string, init?: RequestInit) {
  const res = await fetch(`${env.pythonUrl}${path}`, init);
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error(body.error ?? `Python service returned ${res.status}`);
  return body;
}

async function scrapeGroup(group: FacebookGroup) {
  const runId = await runsRepo.start(group.id);
  try {
    const { jobId } = await py('/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupUrl: group.url, scrolls: group.scrolls, liveOnly: group.liveOnly }),
    });
    let job: any;
    do {
      await sleep(2000);
      job = await py(`/jobs/${jobId}`);
      progress.log = job.log.slice(-5);
    } while (job.status === 'running');

    if (job.status !== 'done') throw new Error(job.log.slice(-3).join(' | ') || `exit code ${job.exitCode}`);
    const items = job.results as ScrapedItem[];
    const added = await livestreamsRepo.upsertMany(group.id, items);
    await groupsRepo.markScraped(group.id);
    await runsRepo.finish(runId, { status: 'done', found: items.length, added });
  } catch (e) {
    await runsRepo.finish(runId, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Keeps data/livestreams.json in sync with the database (the original JSON output). */
export async function exportJson() {
  const rows = await livestreamsRepo.list({ limit: 100000 });
  await Bun.write(
    EXPORT_FILE,
    JSON.stringify(
      rows.map((r) => ({ id: r.videoId, url: r.url, is_live: r.isLive, group: r.groupName, first_seen_at: r.firstSeenAt })),
      null,
      2,
    ),
  );
}

/** Starts a background run over the given groups (or all active ones). Returns false if already running. */
export async function startScrape(groupIds?: string[]): Promise<{ started: boolean; groups: number }> {
  if (progress.running) return { started: false, groups: 0 };
  const all = await groupsRepo.list();
  const groups = groupIds?.length ? all.filter((g) => groupIds.includes(g.id)) : all.filter((g) => g.isActive);
  if (!groups.length) return { started: false, groups: 0 };

  progress.running = true;
  progress.queued = groups.length;
  (async () => {
    try {
      for (const g of groups) {
        progress.currentGroup = g.name;
        await scrapeGroup(g);
        progress.queued--;
      }
      await exportJson();
    } finally {
      progress.running = false;
      progress.currentGroup = null;
      progress.queued = 0;
    }
  })();
  return { started: true, groups: groups.length };
}
