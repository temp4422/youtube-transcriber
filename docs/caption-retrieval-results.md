# Caption retrieval experiment

## Local run — 2026-11-03

Runtime: Python 3.12, Gunicorn, youtube-transcript-api 1.2.4, serving http://localhost:3000 directly on the developer machine. This was not a Docker or VPS run.

POST `/api/probe` for `NYFGCESmikA`, the supplied DHH podcast, with source language `en`:

- Status: `retrieved`.
- Source: manually supplied English captions, preferred over the available automatic English track.
- Other available track: manually supplied Russian captions. Listing a track does not establish the original spoken language; English was explicitly requested for this sample.
- Segments: 4,773.
- UTF-8 text size: 289,930 bytes.
- Final caption end: 18,940.172 seconds (about 5 hours 16 minutes).
- Retrieval elapsed: 1.771 seconds.
- SHA-256: `e31fc5e822bb014b8a2a1d425fe97a55a24126ada812b2855f1963c501150f6c`.
- UTC observation: 2026-11-03T21:17:25.871160+00:00.

The health endpoint returned 200 and invalid video input returned 400. Track listing succeeded separately, and an immediate repeat request returned 429, confirming the cooldown. Both production and development Compose configurations validated successfully with `docker compose config --quiet`.

## Limits of the result

The local Docker daemon was unavailable, so an image build and container execution have not been verified. No GitHub remote was provided; no push or VPS deployment was attempted. The Docker image, Compose configuration, and push-to-main workflow are prepared.

This single successful local request does not prove complete transcription or reliable hosted access. The next required check is the same probe on the intended VPS, followed by a small sample of other multi-hour videos, manual and automatic captions, different source languages, and modest repeated requests. No paid fallback is selected.
