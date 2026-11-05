import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTranscriptRows, retrieveCaptions } from '../src/lib/captions.ts';

test('reads timestamps including multi-hour videos without inventing durations', () => {
  assert.deepEqual(parseTranscriptRows([
    { timestamp: ' 1:23 ', text: ' Hello. ' },
    { timestamp: '5:16:40', text: 'The end.' },
  ]), [
    { text: 'Hello.', startSeconds: 83, durationSeconds: 0 },
    { text: 'The end.', startSeconds: 19000, durationSeconds: 0 },
  ]);
});
test('rejects malformed or empty transcript rows', () => {
  for (const rows of [[], [{ timestamp: '1:99', text: 'Text' }],
    [{ timestamp: 'bad', text: 'Text' }], [{ timestamp: '0:01', text: ' ' }]])
    assert.throws(() => parseTranscriptRows(rows));
});
test('an aborted request never launches Chromium', async () => {
  await assert.rejects(retrieveCaptions('MyFKybHCdjE', undefined, AbortSignal.abort()), { code: 'TIMEOUT' });
});
