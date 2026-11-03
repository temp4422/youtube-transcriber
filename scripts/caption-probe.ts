import { YouTubeTranscriptApi } from '@hallelx/youtube-transcript';
const [id, language, kind] = process.argv.slice(2);
if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Usage: npm run probe -- VIDEO_ID [language] [generated]');
const signal = AbortSignal.timeout(60_000);
const api = new YouTubeTranscriptApi({ fetchFn: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal }) });
const started = performance.now();
try {
  const tracks = await api.list(id);
  console.log(JSON.stringify({ videoId: id, tracks: [...tracks].map(t => ({ language: t.languageCode, generated: t.isGenerated })) }));
  if (language) {
    const track = kind === 'generated' ? tracks.findGeneratedTranscript([language]) : tracks.findTranscript([language]);
    const data = await track.fetch();
    console.log(JSON.stringify({ status: 'retrieved', language: data.languageCode, generated: data.isGenerated, segments: data.length, bytes: Buffer.byteLength(data.snippets.map(s => s.text).join('\n')), lastEndSeconds: Math.max(...data.snippets.map(s => s.start + s.duration)), elapsedMs: Math.round(performance.now() - started) }));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.name : 'Unknown', timedOut: signal.aborted, elapsedMs: Math.round(performance.now() - started) }));
  process.exitCode = 1;
}
