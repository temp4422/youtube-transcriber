import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTranscript } from '../src/lib/format-transcript.ts';
const segment = (text, startSeconds = 0, durationSeconds = 2) => ({
  text,
  startSeconds,
  durationSeconds,
});

test('cleans whitespace and preserves punctuation and repeated speech', () => {
  assert.equal(
    formatTranscript([segment('  Hello\nworld'), segment(', yes yes!')]),
    'Hello world, yes yes!',
  );
});

test('removes only multiword overlap with overlapping timestamps', () => {
  const a = segment('one two three four', 0, 3);
  assert.equal(
    formatTranscript([a, segment('two three four five', 2)]),
    'one two three four five',
  );
  assert.equal(
    formatTranscript([a, segment('two three four five', 4)]),
    'one two three four two three four five',
  );
  assert.equal(
    formatTranscript([segment('yes yes'), segment('yes yes indeed', 1)]),
    'yes yes yes yes indeed',
  );
});

test('preserves Unicode boundary spacing including supplementary Han and emoji', () => {
  for (const text of ['你好 世界', '𠀀 𠀁', 'あ い', 'カ ナ', 'ก ข']) {
    assert.equal(formatTranscript([segment(text)]), text.replaceAll(' ', ''));
  }
  assert.equal(formatTranscript([segment('Hello 😀 world')]), 'Hello 😀 world');
  assert.equal(formatTranscript([segment('Hello 世界')]), 'Hello 世界');
});

test('breaks long text into paragraphs without losing words', () => {
  const text = 'A spoken sentence. '.repeat(200).trim();
  const formatted = formatTranscript([segment(text)]);
  assert.ok(formatted.includes('\n\n'));
  assert.equal(formatted.replaceAll('\n\n', ' '), text);
});

test('uses pauses for paragraph breaks and tolerates invalid language codes', () => {
  const first = 'word '.repeat(45).trim();
  assert.equal(
    formatTranscript(
      [segment(first), segment('Next thought.', 5)],
      'invalid_locale',
    ),
    first + '\n\nNext thought.',
  );
  assert.equal(formatTranscript([]), '');
});
