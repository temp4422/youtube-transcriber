import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireRequest } from '../src/lib/request-limits.ts';

test('enforces per-client and global concurrency, with idempotent release', () => {
  const releases = [];
  try {
    releases.push(acquireRequest('a', 0));
    assert.throws(() => acquireRequest('a', 0), { code: 'RATE_LIMITED' });
    releases.push(acquireRequest('b', 0), acquireRequest('c', 0));
    assert.throws(() => acquireRequest('d', 0), { code: 'BUSY' });
    releases[0]();
    releases[0]();
    releases.push(acquireRequest('d', 0));
    assert.throws(() => acquireRequest('e', 0), { code: 'BUSY' });
  } finally {
    releases.forEach((release) => release());
  }
});

test('expires admitted requests after the rolling window', () => {
  for (let i = 0; i < 10; i++) acquireRequest('rolling', 0)();
  assert.throws(() => acquireRequest('rolling', 0), {
    code: 'RATE_LIMITED',
    retryAfterSeconds: 600,
  });
  acquireRequest('rolling', 600_000)();
});
