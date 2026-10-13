import { expect, test } from 'bun:test';
import { livestreams } from './livestreams';

test('rejects a groupId that is not a UUID before querying', async () => {
  const res = await livestreams.request('/?groupId=1; DROP TABLE livestream');
  expect(res.status).toBe(400);
});
