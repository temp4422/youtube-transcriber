import { Innertube, YTNodes } from 'youtubei.js';
import type { CaptionResult } from './captions.ts';
import { AppError } from './errors.ts';

export async function retrieveYouTubeJsCaptions(
  videoId: string, languageCode: string | undefined, signal: AbortSignal,
): Promise<CaptionResult> {
  let blocked = false;
  let stage = 'session';
  try {
    signal.throwIfAborted();
    const youtube = await Innertube.create({
      lang: 'en', location: 'US', retrieve_player: false,
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
      }),
    });
    stage = 'video_info';
    const info = await youtube.getInfo(videoId);
    blocked = /bot/i.test(info.playability_status?.reason ?? '');
    // Try the transcript panel even when player access was refused.
    stage = 'transcript';
    let transcript = await info.getTranscript();
    const tracks = (info.captions?.caption_tracks ?? [])
      .filter(track => transcript.languages.includes(track.name.toString()));
    const code = (tracks.find(t => t.language_code === languageCode)
      ?? tracks.find(t => t.language_code === 'en')
      ?? tracks.find(t => t.language_code.startsWith('en-'))
      ?? tracks[0])?.language_code;
    const matching = tracks.filter(t => t.language_code === code);
    const selected = matching.find(t => t.kind !== 'asr') ?? matching[0];
    if (selected) transcript = await transcript.selectLanguage(selected.name.toString());
    stage = 'parse';
    const actual = tracks.find(t => t.name.toString() === transcript.selectedLanguage);
    const segments = (transcript.transcript?.content?.body?.initial_segments
      .filterType(YTNodes.TranscriptSegment) ?? [])
      .map(segment => ({ text: segment.snippet.toString(),
        startSeconds: Number(segment.start_ms) / 1000,
        durationSeconds: (Number(segment.end_ms) - Number(segment.start_ms)) / 1000 }));
    if (!segments.some(s => s.text.trim()) || segments.some(s =>
      !Number.isFinite(s.startSeconds) || !Number.isFinite(s.durationSeconds) || s.durationSeconds < 0)) {
      throw new Error('Invalid transcript segments');
    }
    signal.throwIfAborted();
    return {
      segments, languageCode: actual?.language_code ?? 'und',
      isGenerated: actual ? actual.kind === 'asr' : /auto.generated/i.test(transcript.selectedLanguage),
      // Do not offer inferred language codes or automatic translations.
      languages: [...new Map(tracks.map(t => [t.language_code,
        { code: t.language_code, label: t.name.toString() }])).values()],
    };
  } catch (error) {
    if (signal.aborted) throw new AppError(504, 'TIMEOUT', 'Caption retrieval took too long. Try again.', true);
    const message = error instanceof Error ? error.message : '';
    console.warn(JSON.stringify({ event: 'caption_backend_error', backend: 'youtubejs', stage,
      upstreamStatus: message.match(/status code (\d{3})/)?.[1], blocked }));
    if (blocked || /confirm.*not a bot|too many requests|status code 429/i.test(message))
      throw new AppError(503, 'UPSTREAM_BLOCKED', 'YouTube is blocking requests from this server.', true);
    // Missing panels and precondition errors can also be upstream restrictions;
    // do not falsely claim that the video has no captions.
    throw new AppError(502, 'RETRIEVAL_FAILED', 'YouTube.js could not retrieve this transcript.', true);
  }
}
