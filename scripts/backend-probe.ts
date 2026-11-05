import { retrieveCaptions, closeCaptionBrowser } from '../src/lib/captions.ts';
const [videoId, languageCode] = process.argv.slice(2);
if (!videoId || !/^[\w-]{11}$/.test(videoId)) throw new Error('Usage: npm run probe:backend -- VIDEO_ID [language]');
const backend = 'chromium';
const started = performance.now();
try {
  const result = await retrieveCaptions(videoId, languageCode, AbortSignal.timeout(60_000));
  console.log(JSON.stringify({ backend, videoId, status: 'retrieved', languageCode: result.languageCode,
    isGenerated: result.isGenerated, languages: result.languages, segments: result.segments.length,
    bytes: Buffer.byteLength(result.segments.map(s => s.text).join('\n')),
    lastEndSeconds: Math.max(...result.segments.map(s => s.startSeconds + s.durationSeconds)),
    elapsedMs: Math.round(performance.now() - started) }));
} catch (error) {
  console.error(JSON.stringify({ backend, videoId, status: 'failed',
    code: error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN',
    elapsedMs: Math.round(performance.now() - started) }));
  process.exitCode = 1;
}

finally { await closeCaptionBrowser(); }
