# Chromium rebuild verification — 2026-11-05

Local project only. No Contabo changes or deployment were performed.

## Implemented

Playwright 1.64.1 with its bundled headless Chromium replaces the transcript
libraries and yt-dlp/token-provider experiments. Development and production use
the same Node 24.22.0 Docker base, browser binaries, system dependencies and npm
lockfile. Each request uses a new signed-out browser context in a shared process.
The extractor handles both legacy transcript renderers and the modern
`transcript-segment-view-model` layout observed during this test.

## Results

- 16 unit tests passed.
- Two real-Chromium fixture tests passed inside the production image build.
- Astro type check and production build passed inside Docker.
- Both Compose configurations validated.
- Development Docker target built; corrected startup command returned HTTP 200
  from `/health`. Duplicate host flags in the previous command were removed.
- Final production Docker probe for `MyFKybHCdjE`: retrieved 99 rows, 14,902 UTF-8
  bytes, final row start 936 seconds (15:36), elapsed 5,721 ms. Fresh browser
  context; no account or imported cookies.

Earlier live requests intermittently failed to expose the transcript panel.
A successful local run does not establish server reliability or exact coverage
through the end of speech. The last timestamp is a row start, not an inferred
caption duration. Language and generated/manual provenance are unknown, and the
app reports those as `und` and `null` rather than guessing. The transcript uses
YouTube's default panel selection, which may follow its locale/dubbing defaults.

Use the commands in README.md to test the same image on Contabo. No proxy,
account, token service, or paid API is configured.
