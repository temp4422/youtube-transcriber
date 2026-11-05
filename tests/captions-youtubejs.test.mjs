import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Innertube } from 'youtubei.js';
import { retrieveYouTubeJsCaptions } from '../src/lib/captions-youtubejs.ts';

const run = (signal = new AbortController().signal) => retrieveYouTubeJsCaptions('MyFKybHCdjE', 'en', signal);
test('retrieves transcript despite blocked player and converts millisecond timing', async t => {
  const transcript = {
    languages: ['English', 'English (auto-generated)'], selectedLanguage: 'English',
    selectLanguage: async name => { assert.equal(name, 'English'); return transcript; },
    transcript: { content: { body: { initial_segments: { filterType: () => [
      { snippet: { toString: () => 'Hello.' }, start_ms: '1200', end_ms: '3400' },
    ] } } } },
  };
  t.mock.method(Innertube, 'create', async () => ({ getInfo: async () => ({
    playability_status: { reason: 'Sign in to confirm you’re not a bot' },
    captions: { caption_tracks: [
      { language_code: 'en', kind: 'asr', name: 'English (auto-generated)' },
      { language_code: 'en', name: 'English' },
    ] }, getTranscript: async () => transcript,
  }) }));
  const result = await run();
  assert.deepEqual(result.segments, [{ text: 'Hello.', startSeconds: 1.2, durationSeconds: 2.2 }]);
  assert.equal(result.isGenerated, false);
  assert.equal(result.languageCode, 'en');
});
test('preserves blocking and timeout errors instead of reporting absent captions', async t => {
  t.mock.method(Innertube, 'create', async () => ({ getInfo: async () => ({
    playability_status: { reason: 'Sign in to confirm you’re not a bot' },
    getTranscript: async () => { throw new Error('Precondition check failed'); },
  }) }));
  await assert.rejects(run(), { code: 'UPSTREAM_BLOCKED' });
  await assert.rejects(run(AbortSignal.abort()), { code: 'TIMEOUT' });
});
