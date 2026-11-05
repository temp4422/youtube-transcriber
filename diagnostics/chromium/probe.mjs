import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const videoId = process.argv[2];
if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
  console.error('Usage: chromium-probe VIDEO_ID');
  process.exit(2);
}
const output = '/artifacts';
await mkdir(output, { recursive: true });
const prefix = path.join(output, `${videoId}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const result = { videoId, signedOut: true, headless: true, status: 'failed', stage: 'launch' };
let browser;
let page;
let expired = false;
const started = Date.now();
const deadline = setTimeout(() => {
  expired = true;
  void browser?.close().catch(() => {});
}, 90_000);


try {
  browser = await chromium.launch({ headless: true, channel: 'chromium', timeout: 25_000 });
  result.browserVersion = browser.version();
  // New nonpersistent context: never imports a personal profile or cookies.
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  result.stage = 'navigation';
  const response = await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  result.pageHttpStatus = response?.status();
  result.stage = 'consent';
  const reject = page.getByRole('button', { name: /Reject all/i }).first();
  if (await reject.isVisible()) {
    await reject.click();
    await page.waitForURL(url => url.hostname.endsWith('youtube.com'), { timeout: 15_000 });
  }
  await page.locator('ytd-watch-flexy, #player-error-message-container').first().waitFor({ timeout: 20_000 });
  result.playability = await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const data = player?.getPlayerResponse?.() ?? window.ytInitialPlayerResponse;
    return { status: data?.playabilityStatus?.status ?? 'unknown',
      botCheck: /not a bot/i.test(data?.playabilityStatus?.reason ?? '') };
  });
  result.stage = 'open_transcript';
  const more = page.locator('ytd-watch-metadata #description-inline-expander #expand');
  if (await more.isVisible()) await more.click();
  const show = page.getByRole('button', { name: /Show transcript/i }).first();
  await show.waitFor({ state: 'visible', timeout: 15_000 });
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/get_transcript')) result.transcriptHttpStatus = response.status();
  });
  await show.click();
  result.stage = 'read_transcript';
  const rows = page.locator('transcript-segment-view-model, ytd-transcript-segment-renderer');
  await rows.first().waitFor({ state: 'visible', timeout: 20_000 });
  // Both YouTube's current view-model markup and its older renderer markup.
  const segments = await rows.evaluateAll(elements => elements.map(element => {
    const text = element.querySelector('span[role="text"], .segment-text')?.textContent?.trim() ?? '';
    const timestamp = element.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp')?.textContent?.trim() ?? '';
    const parts = timestamp.split(':').map(Number);
    const startSeconds = /^\d+(?::\d{2}){1,2}$/.test(timestamp)
      ? parts.reduce((total, part) => total * 60 + part, 0) : null;
    return { text, startSeconds };
  }).filter(segment => segment.text));
  result.source = 'rendered_transcript_panel';
  const text = segments.map(s => s.text).join('\n');
  if (!text.trim()) throw new Error('EMPTY_TRANSCRIPT');
  await writeFile(`${prefix}.txt`, text + '\n');
  result.status = 'retrieved';
  result.stage = 'complete';
  result.segments = segments.length;
  result.bytes = Buffer.byteLength(text);
  const starts = segments.map(s => s.startSeconds).filter(Number.isFinite);
  result.lastStartSeconds = starts.length ? Math.max(...starts) : null;
  result.coverage = 'Verify the saved text and final timestamp; retrieval alone does not prove completeness.';
  result.transcriptFile = `${prefix}.txt`;
} catch (error) {
  result.code = expired ? 'TIMEOUT' : result.playability?.botCheck ? 'UPSTREAM_BLOCKED' : 'TRANSCRIPT_NOT_RETRIEVED';
  // Avoid writing raw network errors, cookies, or signed URLs.
  result.errorType = error instanceof Error ? error.name : 'Unknown';
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (page && !page.isClosed()) {
    try { await page.screenshot({ path: `${prefix}.png`, timeout: 5_000 }); result.screenshotFile = `${prefix}.png`; } catch {}
  }
  await browser?.close().catch(() => {});
  result.elapsedMs = Date.now() - started;
  await writeFile(`${prefix}.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
