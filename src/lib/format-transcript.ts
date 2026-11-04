import type { Segment } from './contracts.ts';
const TARGET = 600;
const SOFT_MAX = 1000;
const NO_SPACE_START =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const NO_SPACE_END =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]$/u;
function join(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  // Anchored Unicode checks inspect boundary code points without copying strings.
  const noSpace =
    /^[,.;:!?，。！？、)\]}]/u.test(right) ||
    /[(\[{]$/.test(left) ||
    (NO_SPACE_END.test(left) && NO_SPACE_START.test(right));
  return left + (noSpace ? '' : ' ') + right;
}
export function formatTranscript(segments: Segment[], language = 'en'): string {
  let sentenceSegmenter: Intl.Segmenter;
  try {
    sentenceSegmenter = new Intl.Segmenter(language, {
      granularity: 'sentence',
    });
  } catch {
    sentenceSegmenter = new Intl.Segmenter(undefined, {
      granularity: 'sentence',
    });
  }
  const paragraphs: string[] = [];
  let paragraph = '';
  let previous: Segment | undefined;
  let previousText = '';
  const flush = () => {
    if (paragraph) paragraphs.push(paragraph);
    paragraph = '';
  };
  for (const segment of segments) {
    let text = segment.text.replace(/\s+/gu, ' ').trim();
    if (!text) continue;
    const rawText = text;
    // Only exact multi-word overlap with overlapping timestamps is removable.
    if (
      previous &&
      segment.startSeconds < previous.startSeconds + previous.durationSeconds &&
      segment.startSeconds >= previous.startSeconds
    ) {
      const before = previousText.split(' ');
      const after = text.split(' ');
      for (
        let count = Math.min(before.length, after.length);
        count >= 3;
        count--
      ) {
        if (
          before.slice(-count).join(' ') === after.slice(0, count).join(' ')
        ) {
          text = after.slice(count).join(' ');
          break;
        }
      }
    }
    const gap = previous
      ? segment.startSeconds - previous.startSeconds - previous.durationSeconds
      : 0;
    if (gap >= 2 && paragraph.length >= 200) flush();
    for (const sentence of sentenceSegmenter.segment(text)) {
      const piece = sentence.segment.trim();
      if (!piece) continue;
      if (paragraph.length >= TARGET && /[.!?。！？]["'”’)]?$/u.test(paragraph))
        flush();
      // Space-separated tokens permit soft wrapping without cutting words.
      for (const token of piece.split(' ')) {
        if (paragraph.length >= SOFT_MAX) flush();
        paragraph = join(paragraph, token);
      }
      if (paragraph.length >= TARGET && /[.!?。！？]["'”’)]?$/u.test(paragraph))
        flush();
    }
    previous = segment;
    previousText = rawText;
  }
  flush();
  return paragraphs.join('\n\n');
}
