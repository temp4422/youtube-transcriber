# YouTube Transcriber — headless Chromium

An Astro/TypeScript app that opens YouTube in signed-out headless Chromium,
clicks **Show transcript**, and formats the visible caption rows. Copy or download
the result as text. No paid services, proxies, account cookies, token providers,
yt-dlp, or alternate caption libraries.

## Docker: production

```sh
docker compose up -d --build --wait
```

Open http://localhost:3005. On Contabo, keep the existing reverse proxy and domain;
the host port remains loopback-only. `PORT` overrides 3005. Nothing in this
revision changes DNS or the reverse proxy.

## Docker: development

```sh
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build
```

Open the same URL. Source files are mounted read-only for Astro reload. Dev and
prod share the same Docker base: Node 24.22.0, locked npm dependencies, Playwright
1.64.1, its matching Chromium build, and browser system libraries. Dev runs Astro;
prod runs its compiled server. Use only one mode at a time. Run `docker compose
down` before switching. Dependency changes require rebuilding.

## Signed-out retrieval test

With the container running:

```sh
docker compose exec app npm run probe -- MyFKybHCdjE
docker compose exec app npm run probe -- NYFGCESmikA
```

Or run a one-off production container without starting the web service:

```sh
docker compose build app
docker compose run --rm --no-deps app npm run probe -- MyFKybHCdjE
```

A passing result reports `status: retrieved`, a nonzero segment/byte count, and
`lastEndSeconds` (the final row's start time; the UI does not provide durations).
No transcript text, cookies, or session tokens are printed. Failure exits nonzero
with an error code. Local success does not establish Contabo access: YouTube may
still block the server's IP or show a different UI.

Useful commands:

```sh
docker compose logs --tail=100 app
docker compose exec app node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log(r.status))"
docker compose down
```

## Retrieval behavior

- One shared browser process; every request gets a new isolated browser context
  with no imported cookies, account, or persistent profile. Contexts close on
  success, failure, or timeout. Browser crashes allow relaunch on the next call.
- Uses the default transcript shown by YouTube. Language selection and manual vs
  automatic caption detection are not inferred: the API returns language `und`,
  `isGenerated: null`, and no language choices.
- Existing captions only; this does not transcribe audio. Playback success alone
  is not a transcript test. Consent is handled by clicking Reject all if shown.
- A 60-second request deadline, 5 MiB output limit, and existing per-IP admission
  limits remain. There are at most three active retrievals. Chromium adds memory
  overhead; Compose sets 2 GiB memory, two CPUs, and 512 MiB shared memory.
- No transcript persistence or browser debug port. Docker runs as the `node`
  user with an init process. Playwright's default Chromium sandbox setting is
  retained; this is a single-purpose YouTube browser, not a general URL browser.

The UI may change, and YouTube may refuse automated/signed-out access. A missing
panel is reported separately from an explicit bot block. This implementation is
an experiment, not a guarantee of reliable hosted retrieval.

## Checks

Docker production builds run offline unit tests, a real Chromium test against
an intercepted HTML fixture, type checks, and the Astro build. The fixture test
verifies consent, description expansion, clicking the panel, and extracting
multi-hour timestamps; it does not establish real YouTube availability.

For host development use Node 24.22.0:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm run check
npm run build
npm run probe -- MyFKybHCdjE
```

Docker is the recommended environment for parity with Contabo. Historical
experiments in `docs/` describe older implementations; this README describes the
current Chromium backend. `TRUST_PROXY=true` is only appropriate behind a proxy
that overwrites `X-Real-IP` and prevents clients from bypassing it.
