# YouTube Transcriber

A small Astro + TypeScript app that turns existing YouTube captions into readable paragraphs. Paste a video link, select a caption language when prompted, and copy the text. No sign-in, saved history, audio transcription, translation, or paid services.

## Run locally

Use Node **24.22.0** (`nvm use`) and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The selected library does not reliably expose original-language metadata, so the app asks you to confirm a language. It prefers creator-provided captions within that language and uses automatic captions when necessary.

To run the production build directly:

```sh
npm run check
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
- Runtime defaults live in `src/lib/request-limits.ts`, `src/lib/format-transcript.ts`, and the API route.

## Retrieval diagnostic

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
