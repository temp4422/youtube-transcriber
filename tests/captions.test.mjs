import assert from 'node:assert/strict';
import { test } from 'node:test';
import { YouTubeTranscriptApi } from '@hallelx/youtube-transcript';
import { retrieveCaptions } from '../src/lib/captions.ts';
import { POST } from '../src/pages/api/transcribe.ts';

process.env.CAPTION_BACKEND = 'legacy';

const track = (languageCode, isGenerated = false, text = 'Hello world.') => ({
  languageCode,
  isGenerated,
  language: languageCode,
  fetch: async () => ({ snippets: [{ text, start: 0, duration: 2 }] }),
});
const get = (language) =>
  retrieveCaptions('NYFGCESmikA', language, new AbortController().signal);

test('selects requested language, English fallback, and manual captions', async (t) => {
  let tracks = [track('de'), track('en', true), track('en')];
  t.mock.method(YouTubeTranscriptApi.prototype, 'list', async () => tracks);
  assert.equal((await get()).languageCode, 'en');
  assert.equal((await get()).isGenerated, false);
  assert.equal((await get('de')).languageCode, 'de');
  assert.equal((await get('fr')).languageCode, 'en');
  assert.equal((await get()).languages.length, 2);
  tracks = [track('de'), track('en-GB', true)];
  assert.equal((await get()).languageCode, 'en-GB');
  assert.equal((await get()).isGenerated, true);
  tracks = [track('de')];
  assert.equal((await get()).languageCode, 'de');
});

test('rejects missing, malformed, and empty captions and reports aborts', async (t) => {
  let tracks = [];
  t.mock.method(YouTubeTranscriptApi.prototype, 'list', async () => tracks);
  await assert.rejects(get(), { code: 'NO_CAPTIONS' });
  for (const text of [42, ' ']) {
    tracks = [track('en', false, text)];
    await assert.rejects(get(), { code: 'RETRIEVAL_FAILED' });
  }
  await assert.rejects(
    retrieveCaptions('NYFGCESmikA', undefined, AbortSignal.abort()),
    { code: 'TIMEOUT' },
  );
});

test('endpoint releases capacity after upstream failure and returns a transcript on retry', async (t) => {
  let tracks = [];
  t.mock.method(YouTubeTranscriptApi.prototype, 'list', async () => tracks);
  const post = () =>
    POST({
      clientAddress: 'test-client',
      request: new Request('http://localhost/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://youtu.be/NYFGCESmikA' }),
      }),
    });
  assert.equal((await post()).status, 422);
  tracks = [track('en')];
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).text, 'Hello world.');
});
