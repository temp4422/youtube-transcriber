# YouTube Transcriber

A small Astro + TypeScript app that turns existing YouTube captions into readable paragraphs. Paste a video link, get a transcript automatically, and copy the text. No sign-in, saved history, audio transcription, translation, or paid services.

## Run locally

Use Node **24.22.0** (`nvm use`) and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The selected library does not reliably expose original-language metadata, so the app defaults to English (including regional variants) when available, otherwise the first available caption language. The selector stays on Automatic unless you manually choose a language. You can switch languages after retrieval or return to Automatic. Unavailable language selections use the same fallback. It prefers creator-provided captions within that language and uses automatic captions when necessary.

To run the production build directly:

```sh
npm run check
npm test
npm run build
npm start
```

## Docker

```sh
docker compose up --detach --build --wait
```

Open http://localhost:3000. The app runs as a non-root user, with port 3000 bound to the host's loopback interface. For local source reload:

```sh
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build
```

Production and development use the same service/port; run one mode at a time. Container health: `/health`. Logs: `docker compose logs --tail=100 app`. Stop: `docker compose down`.

`PORT` sets the published host port; the app always listens on port 3000 inside Docker. `BIND_ADDRESS` defaults to `127.0.0.1`.

## Behavior and limits

- Existing captions only, preserving words and punctuation with heuristic paragraph breaks.
- One active request per IP, 10 admitted requests per 10 minutes, and three active retrievals overall. Shared networks share the limit. Limits reset on restart; run one process/container.
- A 60-second upstream deadline aborts network operations. The browser waits up to 65 seconds.
- Maximum request body: 4 KiB. Maximum output: 5 MiB. Oversized transcripts return an error rather than being truncated.
- No transcript caching or persistence. Library errors distinguish missing captions, inaccessible videos, server blocking, and temporary failures.
- Runtime defaults are named constants in the modules responsible for each limit.

## Code organization

- `src/pages/api/transcribe.ts` coordinates validation, admission limits, retrieval, and formatting, and maps errors to HTTP responses.
- `src/lib/transcript-request.ts` reads size-limited JSON and validates the video link and optional language before retrieval.
- `src/lib/captions.ts` owns the YouTube library integration, language selection, caption validation, and upstream error mapping.
- `src/lib/format-transcript.ts` formats caption segments into paragraphs; `src/lib/request-limits.ts` owns in-memory admission limits.
- `src/lib/contracts.ts` defines shared data types; `src/lib/errors.ts` defines application errors.
- `src/pages/index.astro` owns markup and styles; `src/scripts/transcriber.ts` owns browser interactions, loading state, and clipboard feedback.

## Retrieval diagnostic

`npm test` runs a small offline regression suite with Node's built-in test runner. It covers request validation and body deadlines, language fallback, malformed captions, transcript formatting and Unicode spacing, and request-limit cleanup. Caption retrieval is mocked in these tests; use the app or the probe below to verify real YouTube access. Docker builds run the regression suite before type checking and building.

```sh
npm run probe -- NYFGCESmikA en
npm run probe -- NYFGCESmikA en generated
npm run probe -- T87ZtZAoiiQ de
```

Omit language to list tracks. The diagnostic prints counts, timings, and coverage, not transcript text. It is not an alternate backend. See `docs/local-verification.md` for observed results and limitations.

## Future VPS deployment — not performed

The prepared GitHub Actions workflow runs on pushes to `main`, SSHes into the VPS, pulls into `~/youtube-transcriber`, and rebuilds with Docker Compose. The user will supply the Git remote later. Before deployment:

1. Create/identify the intended GitHub repository and configure `VPS_HOST`, `VPS_USER`, and `VPS_SSH_PRIVATE_KEY` secrets.
2. Prepare its `main` checkout at `~/youtube-transcriber` with Git pull access, Docker, and Compose `--wait` support.
3. Put an HTTPS reverse proxy in front of the loopback-only app port. Set its upstream timeout above 60 seconds (e.g. 75 seconds).
4. If enabling `TRUST_PROXY=true`, the proxy must overwrite `X-Real-IP` with the actual connecting visitor IP, and clients must not be able to bypass the proxy. Leave it false for direct local use. Never pass through an untrusted caller's IP header.
5. Verify real caption retrieval from the VPS. Local success does not prove VPS reliability. If YouTube consistently blocks it, revisit the decision with the owner; there is no automatic fallback.

No automatic rollback or multiple-replica support is configured. The historical Python prototype has been removed; its prior observations remain in `docs/caption-retrieval-results.md`.

## Contabo backend experiments

YouTube.js (`CAPTION_BACKEND=youtubejs`) is now the default web backend. It uses
`getInfo()` plus the transcript panel, with a 60-second deadline and no automatic
fallback. `CAPTION_BACKEND=legacy` restores the previous library. Older scope notes
above describe the original implementation; this section supersedes the sole-library
restriction. Both backends may still be blocked by YouTube.

After transferring/pulling this revision into `~/youtube-transcriber` on the VPS:

```sh
cd ~/youtube-transcriber
CAPTION_BACKEND=youtubejs docker compose up -d --build --wait app
```

Test the existing website at https://youtube-transcribe.temp44.top/ . To confirm the
active backend and run the same retrieval path without the UI:

```sh
docker compose exec app printenv CAPTION_BACKEND
docker compose exec app npm run probe:backend -- MyFKybHCdjE
docker compose exec app npm run probe:backend -- NYFGCESmikA en
```

The probe reports counts, language, elapsed time and final caption time; it never
prints transcript text. For a persistent backend selection, set `CAPTION_BACKEND`
in the server's `.env` file. Backend selection is server configuration, not a public
request parameter. YouTube.js only offers language choices it can match to source
caption tracks; otherwise it returns the transcript panel's default with language
`und` (unknown), rather than inventing a language code.

### Test yt-dlp separately

The optional container is a diagnostic, **not yet a web backend**. It does not change
the app or install anything on the Ubuntu host. It downloads only the selected
caption language, prefers manual captions when available, checks for nonempty
JSON3 text, prints counts, and deletes temporary files on exit. English is the
default; supply the actual language code for another video.

```sh
docker compose --profile diagnostics build ytdlp-probe
docker compose --profile diagnostics run --rm ytdlp-probe MyFKybHCdjE en
docker compose --profile diagnostics run --rm ytdlp-probe NYFGCESmikA en
```

Pinned yt-dlp: `2026.10.26`; Node is available for its JavaScript runtime. No account
cookies, proxy, PO-token provider, audio download, or paid service is configured.
A failed test is evidence for the next experiment, not proof that adding tokens
would work. The diagnostics service starts only when explicitly requested.

Rollback the website backend without rebuilding:

```sh
CAPTION_BACKEND=legacy docker compose up -d --wait app
```

For local Node diagnostics: `npm run probe:backend -- MyFKybHCdjE`.
