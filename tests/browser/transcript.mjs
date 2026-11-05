import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readTranscriptPage } from '../../src/lib/captions.ts';

for (const modern of [false, true]) test(`Chromium opens and reads the ${modern ? 'modern' : 'legacy'} transcript panel`, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    assert.deepEqual(await context.cookies(), []);
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `
      <button onclick="this.remove()">Reject all</button>
      <ytd-watch-metadata><div id="description-inline-expander">
        <button id="expand" onclick="document.querySelector('#show').hidden=false;this.remove()">more</button>
      </div></ytd-watch-metadata>
      <button hidden id="show" onclick="document.querySelector('#panel').hidden=false">Show transcript</button>
      <ytd-transcript-renderer hidden id="panel">
        <ytd-transcript-segment-renderer><span class="segment-timestamp">0:01</span><span class="segment-text">First line.</span></ytd-transcript-segment-renderer>
        ${modern ? '<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">1:02:03</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">1 hour</div><span class="ytAttributedStringHost">Last line.</span></transcript-segment-view-model>' : '<ytd-transcript-segment-renderer><span class="segment-timestamp">1:02:03</span><span class="segment-text">Last line.</span></ytd-transcript-segment-renderer>'}
      </ytd-transcript-renderer>` }));
    const result = await readTranscriptPage(await context.newPage(), 'MyFKybHCdjE');
    assert.equal(result.segments.length, 2);
    assert.equal(result.segments[1].startSeconds, 3723);
    assert.equal(result.segments[1].text, 'Last line.');
    assert.equal(result.isGenerated, null);
    assert.equal(result.languageCode, 'und');
  } finally { await browser.close(); }
});
