import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AppError } from './errors.ts';
import type { Segment, Language } from './contracts.ts';

export type CaptionResult = {
  segments: Segment[]; languageCode: string; isGenerated: boolean | null; languages: Language[];
};
let browserPromise: Promise<Browser> | undefined;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, timeout: 20_000 }).then(browser => {
      browser.on('disconnected', () => { browserPromise = undefined; });
      return browser;
    }).catch(error => { browserPromise = undefined; throw error; });
  }
  return browserPromise;
}
export async function closeCaptionBrowser() {
  const pending = browserPromise;
  browserPromise = undefined;
  if (pending) await (await pending).close();
}

export function parseTranscriptRows(rows: { text: string; timestamp: string }[]): Segment[] {
  if (!rows.length) throw new Error('Empty transcript');
  return rows.map(row => {
    const parts = row.timestamp.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p)) || parts.slice(1).some(p => Number(p) >= 60) || !row.text.trim())
      throw new Error('Invalid transcript row');
    const startSeconds = parts.reduce((n, p) => n * 60 + Number(p), 0);
    // The UI exposes starts, not durations; do not fabricate overlap intervals.
    return { text: row.text.trim(), startSeconds, durationSeconds: 0 };
  });
}

/** Reads the transcript through the ordinary signed-out YouTube page UI. */
export async function readTranscriptPage(page: Page, videoId: string): Promise<CaptionResult> {
  await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { waitUntil: 'domcontentloaded' });
  const reject = page.getByRole('button', { name: /Reject all/i }).first();
  try { await reject.waitFor({ state: 'visible', timeout: 3000 }); await reject.click(); } catch { /* No consent dialog. */ }
  const more = page.locator('ytd-watch-metadata #description-inline-expander #expand');
  try { await more.waitFor({ state: 'visible', timeout: 12_000 }); await more.click(); } catch { /* Already expanded or different layout. */ }
  const show = page.getByRole('button', { name: /Show transcript/i }).first();
  try { await show.waitFor({ state: 'visible', timeout: 15_000 }); }
  catch {
    const text = await page.locator('body').innerText();
    if (/confirm.{0,30}not a bot|unusual traffic/i.test(text))
      throw new AppError(503, 'UPSTREAM_BLOCKED', 'YouTube is blocking requests from this server.', true);
    throw new AppError(502, 'TRANSCRIPT_PANEL_UNAVAILABLE', 'YouTube did not expose a transcript panel. The video may be unavailable or have no captions.', true);
  }
  await show.click();
  const rows = page.locator('ytd-transcript-segment-renderer, transcript-segment-view-model');
  await rows.first().waitFor({ state: 'visible', timeout: 15_000 });
  // Wait for the panel's loading indicator to disappear before reading all rows.
  await page.locator('ytd-transcript-renderer tp-yt-paper-spinner[active]').first().waitFor({ state: 'hidden', timeout: 15_000 });
  const data = await rows.evaluateAll(elements => elements.map(element => ({
    text: element.querySelector('.segment-text, span.ytAttributedStringHost')?.textContent ?? '',
    timestamp: element.querySelector('.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp')?.textContent ?? '',
  })));
  return { segments: parseTranscriptRows(data), languageCode: 'und', isGenerated: null, languages: [] };
}

export async function retrieveCaptions(videoId: string, _languageCode: string | undefined, signal: AbortSignal): Promise<CaptionResult> {
  let context: BrowserContext | undefined;
  const abort = () => { void context?.close().catch(() => {}); };
  try {
    signal.throwIfAborted();
    const browser = await getBrowser();
    signal.throwIfAborted();
    // Fresh context: no accounts, imported cookies, or persistent browser profile.
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    signal.addEventListener('abort', abort, { once: true });
    signal.throwIfAborted();
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(25_000);
    const result = await readTranscriptPage(page, videoId);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted) throw new AppError(504, 'TIMEOUT', 'Caption retrieval took too long. Try again.', true);
    if (error instanceof AppError) throw error;
    console.warn(JSON.stringify({ event: 'caption_browser_error', error: error instanceof Error ? error.name : 'Unknown' }));
    throw new AppError(502, 'RETRIEVAL_FAILED', 'Chromium could not read the transcript. Please try again.', true);
  } finally {
    signal.removeEventListener('abort', abort);
    await context?.close().catch(() => {});
  }
}
