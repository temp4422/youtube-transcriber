import { AppError } from './errors.ts';
import { parseVideoUrl } from './youtube-url.ts';

const MAX_BODY_BYTES = 4096;
const BODY_TIMEOUT_MS = 10_000;

function invalidInput() {
  return new AppError(
    400,
    'INVALID_INPUT',
    'Enter a valid YouTube video link.',
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim() !==
    'application/json'
  ) {
    throw new AppError(415, 'INVALID_CONTENT_TYPE', 'Send JSON.');
  }

  const reader = request.body?.getReader();
  if (!reader) throw invalidInput();

  let size = 0;
  let timedOut = false;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, BODY_TIMEOUT_MS);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) {
        throw new AppError(
          408,
          'REQUEST_TIMEOUT',
          'The request took too long to arrive. Please try again.',
          true,
        );
      }
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new AppError(
          413,
          'INPUT_TOO_LARGE',
          'The submitted input is too large.',
        );
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw invalidInput();
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/** Read bounded JSON and return validated inputs for caption retrieval. */
export async function readTranscriptRequest(request: Request): Promise<{
  videoId: string;
  languageCode: string | undefined;
}> {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw invalidInput();

  const { url, languageCode } = body as Record<string, unknown>;
  const videoId = parseVideoUrl(url);
  if (
    languageCode !== undefined &&
    (typeof languageCode !== 'string' ||
      !/^[A-Za-z0-9-]{2,35}$/.test(languageCode))
  ) {
    throw new AppError(
      400,
      'INVALID_INPUT',
      'Choose a valid caption language.',
    );
  }
  return { videoId, languageCode };
}
