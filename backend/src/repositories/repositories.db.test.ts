import { afterAll, beforeEach, expect, test } from 'bun:test';
import { describeDb } from '../../test/db';
import { getDatabase, sql } from '../core/database';
import { groups } from '../routes/groups';
import { groupsRepo } from './groups';
import { livestreamsRepo } from './livestreams';
import { runsRepo } from './runs';

const item = (id: string, is_live = false) => ({ id, url: `https://www.facebook.com/reel/${id}`, is_live });
const newGroup = (n: string) => groupsRepo.create({ name: n, url: `https://www.facebook.com/groups/${n}`, scrolls: 5, liveOnly: false });

describeDb('database', () => {
  beforeEach(async () => {
    await sql()`TRUNCATE facebook_group CASCADE`;
  });
  afterAll(async () => {
    if (process.env.RUN_DB_TESTS === '1') await getDatabase().close();
  });

  test('upsertMany counts only new rows and dedupes on re-run', async () => {
    const g = await newGroup('a');
    expect(await livestreamsRepo.upsertMany(g.id, [item('1'), item('2')])).toBe(2);
    expect(await livestreamsRepo.upsertMany(g.id, [item('2'), item('3')])).toBe(1);
    expect(await livestreamsRepo.list({})).toHaveLength(3);
  });

  test('upsertMany with no items is a no-op', async () => {
    const g = await newGroup('a');
    expect(await livestreamsRepo.upsertMany(g.id, [])).toBe(0);
  });

  test('the same video can exist in two groups', async () => {
    const a = await newGroup('a');
    const b = await newGroup('b');
    await livestreamsRepo.upsertMany(a.id, [item('1')]);
    expect(await livestreamsRepo.upsertMany(b.id, [item('1')])).toBe(1);
  });

  test('is_live is promoted when a known video is later seen live', async () => {
    const g = await newGroup('a');
    await livestreamsRepo.upsertMany(g.id, [item('1', false)]);
    await livestreamsRepo.upsertMany(g.id, [item('1', true)]);
    expect((await livestreamsRepo.list({}))[0]!.isLive).toBe(true);
  });

  test('list filters by group and liveOnly', async () => {
    const a = await newGroup('a');
    const b = await newGroup('b');
    await livestreamsRepo.upsertMany(a.id, [item('1', true), item('2')]);
    await livestreamsRepo.upsertMany(b.id, [item('3', true)]);
    expect(await livestreamsRepo.list({ groupId: a.id })).toHaveLength(2);
    expect(await livestreamsRepo.list({ liveOnly: true })).toHaveLength(2);
    expect(await livestreamsRepo.list({ groupId: a.id, liveOnly: true })).toHaveLength(1);
  });

  test('deleting a group cascades to its livestreams and runs', async () => {
    const g = await newGroup('a');
    await livestreamsRepo.upsertMany(g.id, [item('1')]);
    await runsRepo.start(g.id);
    expect(await groupsRepo.remove(g.id)).toBe(true);
    expect(await livestreamsRepo.list({})).toHaveLength(0);
    expect(await runsRepo.recent()).toHaveLength(0);
  });

  test('groups report their livestream count', async () => {
    const g = await newGroup('a');
    await livestreamsRepo.upsertMany(g.id, [item('1'), item('2')]);
    expect((await groupsRepo.list())[0]!.livestreamCount).toBe(2);
  });

  test('update changes only the given fields', async () => {
    const g = await newGroup('a');
    const u = await groupsRepo.update(g.id, { isActive: false });
    expect(u).toMatchObject({ name: 'a', scrolls: 5, isActive: false });
  });

  test('a run is recorded and failStale closes unfinished ones', async () => {
    const g = await newGroup('a');
    const done = await runsRepo.start(g.id);
    await runsRepo.finish(done, { status: 'done', found: 4, added: 2 });
    await runsRepo.start(g.id); // left 'running', as after a crash
    await runsRepo.failStale();
    const runs = await runsRepo.recent();
    expect(runs.map((r) => r.status).sort()).toEqual(['done', 'failed']);
    expect(runs.find((r) => r.status === 'done')).toMatchObject({ foundCount: 4, newCount: 2 });
  });

  test('POST /groups normalises the URL and rejects duplicates with 409', async () => {
    const make = (url: string) =>
      groups.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'g', url }) });
    const first = await make('facebook.com/groups/mygroup/?ref=share');
    expect(first.status).toBe(201);
    expect((await first.json()).url).toBe('https://www.facebook.com/groups/mygroup');
    expect((await make('https://m.facebook.com/groups/mygroup')).status).toBe(409);
  });

  test('PATCH and DELETE on an unknown id return 404', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    const p = await groups.request(`/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
    expect(p.status).toBe(404);
    expect((await groups.request(`/${id}`, { method: 'DELETE' })).status).toBe(404);
  });
});
