import { AppError } from './errors.ts';
export function parseVideoUrl(input: unknown): string {
  const invalid = () => new AppError(400, 'INVALID_INPUT', 'Enter a valid YouTube video link.');
  if (typeof input !== 'string' || input.length > 2048) throw invalid();
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw invalid();
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (url.hostname === 'youtu.be' && parts.length === 1) id = parts[0]!;
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (parts.length === 2 && ['shorts', 'live', 'embed'].includes(parts[0]!)) id = parts[1]!;
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw invalid();
  return id;
}
