import type { APIRoute } from 'astro';
import { isIP } from 'node:net';
import { readTranscriptRequest } from '../../lib/transcript-request.ts';
import { retrieveCaptions } from '../../lib/captions.ts';
import { formatTranscript } from '../../lib/format-transcript.ts';
import { acquireRequest } from '../../lib/request-limits.ts';
import { AppError } from '../../lib/errors.ts';
import type { TranscriptResponse } from '../../lib/contracts.ts';
export const prerender = false;

const RETRIEVAL_TIMEOUT_MS = 60_000;
const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;

const json = (
  body: TranscriptResponse,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let release: (() => void) | undefined;
  try {
    const { videoId, languageCode } = await readTranscriptRequest(request);
    // Opt-in only behind a proxy that overwrites X-Real-IP; bind to loopback otherwise.
    const forwarded =
      process.env.TRUST_PROXY === 'true'
        ? request.headers.get('x-real-ip')
        : null;
    const ip = forwarded && isIP(forwarded) ? forwarded : clientAddress;
    release = acquireRequest(ip);
    const signal = AbortSignal.any([
      AbortSignal.timeout(RETRIEVAL_TIMEOUT_MS),
      request.signal,
    ]);
    const result = await retrieveCaptions(videoId, languageCode, signal);
    const text = formatTranscript(result.segments, result.languageCode);
    if (Buffer.byteLength(text, 'utf8') > MAX_TRANSCRIPT_BYTES)
      throw new AppError(
        422,
        'TRANSCRIPT_TOO_LARGE',
        'This transcript exceeds the current size limit.',
      );
    return json({
      status: 'success',
      text,
      languageCode: result.languageCode,
      isGenerated: result.isGenerated,
      languages: result.languages,
    });
  } catch (error) {
    const known =
      error instanceof AppError
        ? error
        : new AppError(
            500,
            'INTERNAL_ERROR',
            'Something went wrong. Please try again.',
            true,
          );
    console.warn(
      JSON.stringify({ event: 'transcription_error', code: known.code }),
    );
    return json(
      {
        status: 'error',
        code: known.code,
        message: known.message,
        retryable: known.retryable,
        ...(known.retryAfterSeconds
          ? { retryAfterSeconds: known.retryAfterSeconds }
          : {}),
      },
      known.status,
      known.retryAfterSeconds
        ? { 'Retry-After': String(known.retryAfterSeconds) }
        : {},
    );
  } finally {
    release?.();
  }
};
export const ALL: APIRoute = () =>
  json(
    {
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST.',
      retryable: false,
    },
    405,
    { Allow: 'POST' },
  );
