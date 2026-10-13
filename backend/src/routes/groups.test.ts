import { describe, expect, test } from 'bun:test';
import { groups } from './groups';

const post = (body: unknown) =>
  groups.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (body: unknown) =>
  groups.request('/00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Every case below must be rejected before the database is reached.
describe('POST /groups validation', () => {
  test.each([
    ['non-facebook host', { name: 'x', url: 'https://example.com/groups/abc' }],
    ['look-alike host', { name: 'x', url: 'https://notfacebook.com/groups/abc' }],
    ['not a group path', { name: 'x', url: 'https://www.facebook.com/somepage' }],
    ['empty group path', { name: 'x', url: 'https://www.facebook.com/groups/' }],
    ['blank name', { name: '   ', url: 'https://www.facebook.com/groups/abc' }],
    ['missing name', { url: 'https://www.facebook.com/groups/abc' }],
    ['scrolls too low', { name: 'x', url: 'https://www.facebook.com/groups/abc', scrolls: 0 }],
    ['scrolls too high', { name: 'x', url: 'https://www.facebook.com/groups/abc', scrolls: 501 }],
    ['scrolls not an integer', { name: 'x', url: 'https://www.facebook.com/groups/abc', scrolls: 1.5 }],
  ])('rejects %s', async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });

  test('rejects a non-JSON body', async () => {
    const res = await groups.request('/', { method: 'POST', body: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /groups/:id validation', () => {
  test.each([
    ['blank name', { name: '' }],
    ['scrolls out of range', { scrolls: 1000 }],
    ['isActive not a boolean', { isActive: 'yes' }],
  ])('rejects %s', async (_label, body) => {
    expect((await patch(body)).status).toBe(400);
  });
});
