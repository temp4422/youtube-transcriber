# Contabo backend verification — 2026-11-05

The deployed container reports `CAPTION_BACKEND=youtubejs`. Its logs show
`caption_backend_error`, stage `transcript`, upstream HTTP `400`, and
`blocked: true`, followed by `UPSTREAM_BLOCKED`. This confirms that the new
backend was deployed and attempted the transcript endpoint after the player
bot-check response; switching libraries did not resolve retrieval.

The optional yt-dlp diagnostic image built successfully on the VPS, using
`yt-dlp==2026.10.26`. Both commands exited 1 with `UPSTREAM_BLOCKED`:

```sh
docker compose --profile diagnostics run --rm ytdlp-probe MyFKybHCdjE en
docker compose --profile diagnostics run --rm ytdlp-probe NYFGCESmikA en
```

No captions were retrieved. These tests used no proxy, cookies, or PO-token
provider. They establish failure of the current configurations, not of every
possible yt-dlp configuration. The diagnostic containers were removed with
`--rm`; the image remains available for further tests. The running website and
its backend configuration were not changed during these checks.

Next experiment: isolated yt-dlp with a compatible proof-of-origin token
provider. Verify subtitle-token context support and full subtitle downloads;
successful metadata retrieval or token generation alone is not a passing test.
No token provider has yet been installed or tested on this VPS.

## BgUtils PO-token experiment

Implemented a standalone `docker-compose.pot.yaml`, yt-dlp Docker target with
`bgutil-ytdlp-pot-provider==2.0.2`, and matching provider image `2.0.2`.
The provider was healthy on Contabo. No public port, paid service, cookies, or
proxy was used. Each request had a 60-second deadline.

| Video | Client | Plugin loaded | Player token retrieved | Caption result |
| --- | --- | --- | --- | --- |
| MyFKybHCdjE | mweb | Yes | Yes | UPSTREAM_BLOCKED |
| MyFKybHCdjE | web | Yes | No token requested | UPSTREAM_BLOCKED |
| NYFGCESmikA | mweb | Yes | Yes | UPSTREAM_BLOCKED |

The `web` result is not a successful token test: extraction stopped before any
token was requested. The two `mweb` runs establish that working token generation
did not resolve the block. No subtitle tokens or captions were obtained.

Compose validation and local fake-executable checks passed (argument forwarding,
token-result reporting, nonempty-caption summary, invalid-client rejection).
The actual diagnostic image built and ran on Contabo. The website was not changed.
Test containers were stopped after the experiment. The images remain cached.
