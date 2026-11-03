import type { APIRoute } from 'astro';
import { isIP } from 'node:net';
import { parseVideoUrl } from '../../lib/youtube-url.ts';
import { retrieveCaptions } from '../../lib/captions.ts';
import { formatTranscript } from '../../lib/format-transcript.ts';
import { acquireRequest } from '../../lib/request-limits.ts';
import { AppError } from '../../lib/errors.ts';
import type { TranscriptResponse } from '../../lib/contracts.ts';
export const prerender = false;
const json = (body: TranscriptResponse, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new AppError(415, 'INVALID_CONTENT_TYPE', 'Send JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'INVALID_INPUT', 'Enter a valid YouTube video link.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { void reader.cancel(); }, 10_000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { void reader.cancel(); throw new AppError(413, 'INPUT_TOO_LARGE', 'The submitted input is too large.'); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new AppError(400, 'INVALID_INPUT', 'Enter a valid YouTube video link.'); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let release: (() => void) | undefined;
  try {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'INVALID_INPUT', 'Enter a valid YouTube video link.');
    const { url, languageCode } = body as Record<string, unknown>;
    const videoId = parseVideoUrl(url);
    if (languageCode !== undefined && (typeof languageCode !== 'string' || !/^[A-Za-z0-9-]{2,35}$/.test(languageCode))) throw new AppError(400, 'INVALID_INPUT', 'Choose a valid caption language.');
    // Opt-in only behind a proxy that overwrites X-Real-IP; bind to loopback otherwise.
    const forwarded = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-real-ip') : null;
    const ip = forwarded && isIP(forwarded) ? forwarded : clientAddress;
    release = acquireRequest(ip);
    const signal = AbortSignal.any([AbortSignal.timeout(60_000), request.signal]);
    const result = await retrieveCaptions(videoId, languageCode as string | undefined, signal);
    if (result.status === 'language_required') return json(result);
    const text = formatTranscript(result.segments, result.languageCode);
    if (Buffer.byteLength(text, 'utf8') > 5 * 1024 * 1024) throw new AppError(422, 'TRANSCRIPT_TOO_LARGE', 'This transcript exceeds the current size limit.');
    return json({ status: 'success', text, languageCode: result.languageCode, isGenerated: result.isGenerated });
  } catch (error) {
    const known = error instanceof AppError ? error : new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', true);
    console.warn(JSON.stringify({ event: 'transcription_error', code: known.code }));
    return json({ status: 'error', code: known.code, message: known.message, retryable: known.retryable, ...(known.retryAfterSeconds ? { retryAfterSeconds: known.retryAfterSeconds } : {}) }, known.status, known.retryAfterSeconds ? { 'Retry-After': String(known.retryAfterSeconds) } : {});
  } finally { release?.(); }
};
export const ALL: APIRoute = () => json({ status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'Use POST.', retryable: false }, 405, { Allow: 'POST' });
