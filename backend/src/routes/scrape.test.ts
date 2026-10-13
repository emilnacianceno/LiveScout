import { describe, expect, test } from 'bun:test';
import { scrape } from './scrape';

describe('POST /scrape validation', () => {
  test('rejects non-UUID group ids', async () => {
    const res = await scrape.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: ['not-a-uuid'] }),
    });
    expect(res.status).toBe(400);
  });

  test('rejects groupIds that is not an array', async () => {
    const res = await scrape.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: 'abc' }),
    });
    expect(res.status).toBe(400);
  });
});

test('GET /scrape/status reports an idle scraper', async () => {
  const res = await scrape.request('/status');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ running: false, currentGroup: null, queued: 0 });
});
