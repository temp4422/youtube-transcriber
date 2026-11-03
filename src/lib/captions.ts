import { YouTubeTranscriptApi, RequestBlocked, TranscriptsDisabled, VideoUnavailable, VideoUnplayable, AgeRestricted, CouldNotRetrieveTranscript, NoTranscriptFound } from '@hallelx/youtube-transcript';
import type { Segment, Language } from './contracts.ts';
import { AppError } from './errors.ts';
export type CaptionResult =
  | { status: 'language_required'; languages: Language[]; message?: string }
  | { status: 'captions'; segments: Segment[]; languageCode: string; isGenerated: boolean };

export async function retrieveCaptions(videoId: string, languageCode: string | undefined, signal: AbortSignal): Promise<CaptionResult> {
  const api = new YouTubeTranscriptApi({ fetchFn: (input, init) => fetch(input, {
    ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
  }) });
  try {
    const tracks = [...await api.list(videoId)];
    signal.throwIfAborted();
    if (!tracks.length) throw new AppError(422, 'NO_CAPTIONS', 'No captions are available for this video.');
    const languages = [...new Map(tracks.map(t => [t.languageCode, { code: t.languageCode, label: t.language.replace(/\s*\(auto-generated\)$/i, '') }])).values()];
    // Track language/order alone does not establish the original spoken language.
    if (!languageCode || !tracks.some(t => t.languageCode === languageCode)) return {
      status: 'language_required', languages,
      message: languageCode ? 'That caption language is no longer available. Choose an available language.' : 'We couldn’t confirm the original language. Choose the captions you want.',
    };
    const matching = tracks.filter(t => t.languageCode === languageCode);
    const track = matching.find(t => !t.isGenerated) ?? matching[0]!;
    const fetched = await track.fetch({ preserveFormatting: false });
    signal.throwIfAborted();
    const segments = fetched.snippets.map(s => ({ text: s.text, startSeconds: s.start, durationSeconds: s.duration }));
    if (!segments.some(s => s.text.trim()) || segments.some(s => typeof s.text !== 'string' || !Number.isFinite(s.startSeconds) || !Number.isFinite(s.durationSeconds) || s.durationSeconds < 0)) {
      throw new AppError(502, 'RETRIEVAL_FAILED', 'The captions returned by YouTube could not be read.', true);
    }
    return { status: 'captions', segments, languageCode: track.languageCode, isGenerated: track.isGenerated };
  } catch (error) {
    if (signal.aborted) throw new AppError(504, 'TIMEOUT', 'Caption retrieval took too long. Try again.', true);
    if (error instanceof AppError) throw error;
    if (error instanceof RequestBlocked) throw new AppError(503, 'UPSTREAM_BLOCKED', 'YouTube is blocking requests from this server. Please try again later.', true);
    if (error instanceof TranscriptsDisabled) throw new AppError(422, 'NO_CAPTIONS', 'No captions are available for this video.');
    if (error instanceof VideoUnavailable || error instanceof VideoUnplayable || error instanceof AgeRestricted) throw new AppError(422, 'VIDEO_UNAVAILABLE', 'This video cannot be accessed. Try another public video.');
    if (error instanceof NoTranscriptFound || error instanceof CouldNotRetrieveTranscript || error instanceof TypeError) throw new AppError(502, 'RETRIEVAL_FAILED', 'Captions could not be retrieved right now. Please try again.', true);
    throw error;
  }
}
