# Local implementation and verification — 2026-11-03

The user authorized local implementation and removal of the Python prototype, with no push or deployment. Testing was stopped at the user's request. The application remains available at http://localhost:3000 in the local Docker container.

## Implemented

Astro with scoped CSS and plain TypeScript interactions, a Node POST endpoint, caption-language selection, manual-caption preference, conservative paragraph formatting, exact plain-text Copy, bounded requests, abortable upstream deadlines, in-memory limits, health endpoint, and a non-root Docker image. The Python files, prototype directory, and virtual environment were removed. Historical Python observations remain only as documentation.

Versions: Node 24.22.0, Astro 7.4.5, @astrojs/node 11.1.9, @hallelx/youtube-transcript 0.2.0, TypeScript 6.0.3. npm lockfile is included.

## Checks completed before testing was stopped

- Type checking: zero errors/warnings/hints. Production build passed locally and inside Docker.
- Docker image built; local container reached healthy status. Production and development Compose configurations validated.
- Local TypeScript retrieval of NYFGCESmikA manual English captions: 4,773 segments, 289,930 UTF-8 bytes, final caption end 18,940.172 seconds, about 1.55 seconds retrieval.
- Same video's automatic English captions: 9,126 segments, 289,837 bytes, final end 18,942.16 seconds, about 1.34 seconds retrieval.
- German video T87ZtZAoiiQ: manual German track, 180 segments, 7,723 bytes, final end 483.05 seconds, about 0.93 seconds retrieval.
- Browser flow through the running Docker container: URL submission, language prompt, English choice, full podcast result, and Copy succeeded. Result was 290,045 characters in 442 paragraphs; its final closing words were present. Clipboard text exactly matched the displayed textarea value (comparison performed inside the page to avoid tool-output truncation).
- German retrieval through the container API succeeded: 7,651 formatted characters, 13 paragraphs, no-store response header.
- API checks: health 200, unsupported method 405, invalid URL/JSON 400, wrong content type 415, oversized body 413.
- Browser invalid-link feedback worked. Narrow viewport showed no horizontal page overflow. Browser console contained no captured warnings/errors during the observed flow.
- Focused in-memory checks passed for accepted/rejected URL shapes, repeated spoken words, rolling-caption overlap, long paragraph output, Chinese spacing, rate/concurrency limits, and release behavior.
- Simulated fetch failures verified blocked/missing/unavailable/network error mappings. A controlled abort verified that the abort signal reaches and cancels the injected fetch operation. These are simulations, not real YouTube failure observations.

## Limits and remaining verification

No VPS access or deployment was attempted, and nothing was pushed. Hosted reliability remains unverified. Broad automated tests were intentionally not added. Clipboard denial, a real 60-second stalled upstream request, every browser/device combination, and long-term rate behavior were not exhaustively tested. The development Compose mode was configuration-validated but not separately started. Testing stopped at the user's request; do not resume it without a new request.

## Browser verification after refactoring — 2026-11-04

The user explicitly requested renewed browser testing and real YouTube retrieval. Tested the current production build with Node 24.22.0 at http://127.0.0.1:3000 using the in-app browser.

- Submitted `NYFGCESmikA` with Automatic language selection: English creator-provided captions loaded, producing 290,045 characters in 442 paragraphs. The final closing words were present.
- Clicked Copy text: success feedback appeared, and clipboard text exactly matched the full textarea value (comparison performed within the page to avoid tool-output truncation).
- Selected Russian: retrieval completed with Russian creator-provided captions, producing 232,662 characters. Returning to Automatic restored English and left the selector on Automatic.
- Submitted `T87ZtZAoiiQ`: German creator-provided captions loaded, producing 7,651 characters in 13 paragraphs.
- No browser warning or error logs were captured during these checks.

These were real network requests through the app, not mocked retrievals. No code changes were needed. This run did not verify VPS deployment, automatic-caption tracks, clipboard-denial handling, or timeout behavior.

## Timeout fix, regression suite, and formatter verification — 2026-11-05

Implemented explicit retryable HTTP 408 (`REQUEST_TIMEOUT`) when the request-body deadline expires, including when a stalled stream already contains valid JSON. Replaced per-token character-array allocation with anchored Unicode boundary checks in the formatter.

- `npm test`: all 16 offline regression tests passed on Node 24.22.0. Tests cover stalled empty/valid-JSON bodies, size limits, chunked UTF-8, input validation, language fallback, malformed captions, upstream aborts, capacity release, concurrency/rate limits, caption overlap, paragraph preservation, and supplementary Unicode spacing.
- `npm run check`: zero errors, warnings, or hints. Production build passed. Docker build now runs the suite as well; Docker itself was not rebuilt in this verification.
- Local synthetic benchmark: 5,000 caption segments, three warmups, median of nine runs per version. Formatter time fell from approximately 121 ms to 21 ms, with identical output. This measures formatting only, not end-to-end YouTube latency.
- Restarted the updated production server and tested real requests in the browser. `NYFGCESmikA` returned English creator-provided captions: 290,045 characters, 442 paragraphs, final closing words present. Copy feedback appeared and clipboard text exactly matched the full transcript.
- `T87ZtZAoiiQ` returned German creator-provided captions: 7,651 characters, 13 paragraphs. No browser warning/error logs were captured.

The app remains running locally on port 3000. No push or deployment was performed.
