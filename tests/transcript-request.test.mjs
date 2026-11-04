import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTranscriptRequest } from '../src/lib/transcript-request.ts';

const url = 'https://youtu.be/NYFGCESmikA';
function request(body, contentType = 'application/json') {
  return new Request('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
    duplex: 'half',
  });
}

test('accepts a video link and optional caption language', async () => {
  assert.deepEqual(
    await readTranscriptRequest(
      request(JSON.stringify({ url, languageCode: 'en-US' })),
    ),
    {
      videoId: 'NYFGCESmikA',
      languageCode: 'en-US',
    },
  );
});

test('rejects malformed JSON, invalid fields, and wrong content type', async () => {
  for (const body of [
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ url, languageCode: 42 }),
    JSON.stringify({ url: 'https://example.com' }),
  ]) {
    await assert.rejects(readTranscriptRequest(request(body)), {
      status: 400,
      code: 'INVALID_INPUT',
    });
  }
  await assert.rejects(readTranscriptRequest(request('{}', 'text/plain')), {
    status: 415,
  });
});

test('enforces the byte limit and cancels an oversized stream', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('é'.repeat(2049)));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readTranscriptRequest(request(body)), { status: 413 });
  assert.equal(cancelled, true);
});

test('decodes UTF-8 split across stream chunks', async () => {
  const body = new ReadableStream({
    start(controller) {
      for (const byte of new TextEncoder().encode(
        JSON.stringify({ url, extra: 'é' }),
      ))
        controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  assert.equal(
    (await readTranscriptRequest(request(body))).videoId,
    'NYFGCESmikA',
  );
});

for (const payload of ['', JSON.stringify({ url })]) {
  test(`rejects stalled ${payload ? 'valid JSON' : 'empty'} body at its deadline`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        if (payload) controller.enqueue(new TextEncoder().encode(payload));
      },
      cancel() {
        cancelled = true;
      },
    });
    const pending = readTranscriptRequest(request(body));
    const rejected = assert.rejects(pending, {
      status: 408,
      code: 'REQUEST_TIMEOUT',
      retryable: true,
    });
    t.mock.timers.tick(10_000);
    await rejected;
    assert.equal(cancelled, true);
  });
}
