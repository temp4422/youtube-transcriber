import { AppError } from './errors.ts';
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;
const MAX_ACTIVE = 3;
const MAX_KEYS = 10_000;
const clients = new Map<string, { attempts: number[]; active: boolean }>();
let active = 0;
export function acquireRequest(ip: string, now = Date.now()): () => void {
  for (const [key, entry] of clients) {
    entry.attempts = entry.attempts.filter(time => time > now - WINDOW_MS);
    if (!entry.active && !entry.attempts.length) clients.delete(key);
  }
  const entry = clients.get(ip) ?? { attempts: [], active: false };
  if (entry.active) throw new AppError(429, 'RATE_LIMITED', 'A request is already running. Please wait for it to finish.', true, 5);
  if (entry.attempts.length >= MAX_ATTEMPTS) throw new AppError(429, 'RATE_LIMITED', 'You’ve made several requests. Please wait before trying again.', true, Math.max(1, Math.ceil((entry.attempts[0]! + WINDOW_MS - now) / 1000)));
  if (active >= MAX_ACTIVE || (!clients.has(ip) && clients.size >= MAX_KEYS)) throw new AppError(503, 'BUSY', 'The service is busy. Please try again shortly.', true, 5);
  entry.attempts.push(now);
  entry.active = true;
  clients.set(ip, entry);
  active++;
  let released = false;
  return () => { if (!released) { released = true; entry.active = false; active--; } };
}
