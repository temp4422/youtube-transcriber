# YouTube Transcriber implementation plan

Status: local implementation authorized on 2026-11-03. The user explicitly prohibited pushing or deployment. See local-verification.md for implementation evidence.

## 1. Goal and source of truth

Build a public single-page website where a visitor pastes one YouTube video link, requests its existing captions, reads them as paragraphs, and copies plain transcript text. Multi-hour podcasts are the main use case.

This is the authoritative implementation scope. `GLOSSARY.md` defines terms. `docs/caption-retrieval-results.md` records a historical Python experiment, not proof that the selected TypeScript library or VPS works.

The existing Python service, Dockerfile, Compose files, and root README describe that experiment. The user subsequently requested removal of the Python files and prototype. Preserve the historical results document only, replace the root runtime configuration, and remove the prototype directory and virtual environment.

### Agreed decisions

- Astro, TypeScript, Node.js, npm, and Astro scoped CSS.
- Plain browser TypeScript; no React or UI component-library dependency.
- Astro Node adapter in standalone mode, one application container, one Node process.
- `@hallelx/youtube-transcript` is the sole caption retrieval library. Future replacement is manual. No automatic fallback library, proxy, relay, paid API, or audio transcription service.
- Existing captions only. Prefer manual captions within the original language, otherwise automatic captions in that language. Ask for language selection when original language is uncertain. Never request translation.
- Preserve wording and punctuation. Clean whitespace and clearly duplicated caption overlap. Form paragraphs without adding headings or speaker names; preserve labels already present in the captions.
- Copy only transcript paragraphs, without timestamps, title, source URL, or diagnostic metadata.
- Public access without sign-in. No accounts, history, database, persistent transcripts, transcript cache, queue, summaries, or LLM processing.
- One HTTP request performs retrieval and formatting. A required language choice produces a second user-initiated request.
- Sixty-second server deadline. Clear loading, missing-caption, temporary-failure, timeout, and rate-limit states.
- Modest in-memory limits and one active request per visitor.
- Simple responsive light theme, centered form, and large readable transcript area with Copy.
- Docker on the user's VPS. GitHub pushes to `main` trigger SSH deployment into `~/youtube-transcriber`. Local URL: `http://localhost:3000`.
- Minimal verification: type checking, production build, and manual checks. Broader automated tests wait until the user likes the app.

### Concrete implementation defaults

These are proposed engineering defaults filling in previously unspecified details, not additional user-negotiated requirements. Use named constants or environment configuration so they remain adjustable.

| Setting | Initial default |
| --- | --- |
| Per-IP admitted requests | 10 in a rolling 10-minute window |
| Per-IP active requests | 1, a conservative approximation of one visitor |
| Process-wide active retrievals | 3; reject excess work rather than queueing |
| Tracked IP keys | Maximum 10,000; expire idle entries; never evict active entries to bypass limits |
| JSON request size | 4 KiB |
| URL length | 2,048 characters |
| Transcript output size | 5 MiB UTF-8; explicit error instead of truncation |
| Browser deadline | 65 seconds, slightly longer than the server deadline |
| Paragraph target / soft maximum | 600 / 1,000 characters |
| Pause permitting a paragraph break | 2 seconds, after at least 200 characters |

IP limits can affect people sharing a network. Accept that limitation initially instead of introducing identity tracking.

## 2. Ordered implementation steps

Execute steps in order. Each step ends with a completion criterion. Missing deployment details block deployment, not unrelated local work. The TypeScript retrieval check must succeed locally before building the full interface.

### Step 1 — Establish the TypeScript runtime

1. Read this plan, glossary, historical results, and applicable repository instructions. Inspect the working tree and preserve user changes.
2. Check whether the previous prototype occupies port 3000. Identify it before stopping only that project-owned process; do not kill an unrelated listener.
3. Choose a supported Node LTS release compatible with stable Astro and adapter versions. Verify current engine requirements from official docs/package metadata. Use the same Node major locally and in Docker.
4. Set up npm, `package-lock.json`, strict TypeScript, Astro, and the Node standalone adapter. Use on-demand server endpoints; this is not a static-only deployment.
5. Runtime dependencies: Astro, its Node adapter, and the caption library. Development dependencies: TypeScript and Astro's checker. Add a small TypeScript script runner only if the chosen runtime cannot execute the diagnostic script directly.
6. Provide `npm run dev` on port 3000, `npm run check`, `npm run build`, and `npm start` for the built server. Pin the runtime in package engines, a development version file, and the Dockerfile. Record actual installed versions in the handoff.

Done when: a minimal Astro page loads locally, type checking passes, and the production build starts on port 3000 without Python.

### Step 2 — Validate the selected caption library

1. Inspect the installed library's types and implementation. Do not assume exact parity with Python or a different release's README.
2. Create an explicitly named diagnostic script using the selected library and intended timeout mechanism. Output track metadata, timing, segment count, UTF-8 byte count, and final caption end time. Do not print full transcripts.
3. Test video `NYFGCESmikA`, the supplied DHH podcast, with English explicitly requested for this diagnostic. Verify manual English selection when both manual and generated English tracks exist.
4. Check a confirmed-caption video with automatic captions and one with a different original language. Record actual IDs and observations. Do not fabricate samples or results.
5. Verify nonempty content and plausible coverage through the spoken portion. The historical Python hash/count may differ if captions changed; it is a comparison point, not an exact assertion.
6. If local retrieval fails, distinguish library, environment/network, missing-caption, and blocking failures. Report evidence and pause downstream UI work for a user decision. Do not switch libraries or add a proxy automatically.
7. Repeat on the VPS as soon as deployment access exists. If no remote is available, a successful local check permits local UI work, with hosted reliability explicitly unverified.

Done when: local TypeScript retrieval is documented, with its runtime/library versions and the separate VPS status. Local Python success alone does not satisfy this gate.

### Step 3 — Define the application structure and HTTP contract

Use this small structure or an equivalent with equally clear responsibilities:

```text
src/
  pages/
    index.astro
    api/transcribe.ts
    health.ts
  scripts/transcriber.ts
  lib/
    contracts.ts
    youtube-url.ts
    captions.ts
    format-transcript.ts
    request-limits.ts
scripts/caption-probe.ts
```

`captions.ts` owns library-specific calls and error mapping. The formatter is a pure function over normalized segments. The browser imports only shared types, never the server retrieval package. Avoid a generic provider registry or plugin framework.

POST `/api/transcribe` accepts JSON `{ url: string, languageCode?: string }` and returns:

| Result | HTTP | Body |
| --- | --- | --- |
| Success | 200 | `{ status: "success", text: string, languageCode: string, isGenerated: boolean }` |
| Language decision needed | 200 | `{ status: "language_required", languages: Array<{code: string, label: string}> }` |
| Error | Appropriate error status | `{ status: "error", code: string, message: string, retryable: boolean, retryAfterSeconds?: number }` |

Language options represent existing captions, deduplicated by language code. Set `Cache-Control: no-store` on transcript/language responses. Return 405 for non-POST transcription requests. GET `/health` returns small JSON and HTTP 200 without contacting YouTube.

Done when: shared types and endpoint branches agree on success, language choice, and errors.

### Step 4 — Validate links and choose a language

1. Parse links with the platform URL parser. Allow HTTP/HTTPS video links on exact hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`.
2. Support watch URLs and `/shorts/`, `/live/`, and `/embed/` video paths. Extract an 11-character ID containing letters, digits, underscores, or hyphens. Ignore tracking parameters. Accept a playlist-bearing URL only when it identifies one video. Reject channel links, missing IDs, unrelated hosts, and malformed inputs before network work.
3. Pass only the normalized ID to the library. Never fetch arbitrary visitor-provided URLs.
4. Discover existing tracks with exact language codes and manual/generated metadata. Translation destinations are not existing caption choices.
5. If the visitor selected a language, validate it against the current tracks. Prefer a manual track in exactly that language; otherwise use its generated track.
6. Automatically select original language only when the installed API supplies reliable evidence. Track order, English defaults, browser locale, title language, or the presence of only one track do not establish the spoken language.
7. When evidence is missing or ambiguous, return `language_required`, even for one available language. The UI asks the visitor to confirm the desired caption language. Do not build speech-language detection or an additional scraping subsystem.
8. The next request re-discovers and validates the selection. If the track disappeared, refresh the options with an explanatory message. Keep no server transcript session.

Done when: automatic-caption fallback happens only within the selected language; uncertain original language prompts the user; no silent translation or English fallback occurs.

### Step 5 — Retrieve with cancellation and clear failures

1. Apply one shared 60-second deadline to all upstream work for an admitted request, including discovery and caption download.
2. Use the library's custom fetch capability, if needed, to propagate an abort signal into network operations. Combine the request deadline with any existing library signal. Abort actual fetches; a standalone `Promise.race` leaves background work running and is insufficient.
3. Leave optional retries, proxies, relays, translation, and service fallbacks disabled. Retry is a new visitor action.
4. Normalize successful captions to `{ text, startSeconds, durationSeconds }`, verifying source units. Empty or malformed results are retrieval errors, not successful empty transcripts.
5. Map installed library exceptions to these outcomes. Check actual exception classes rather than guessing names or matching arbitrary error strings.

| Condition | HTTP / code | User-facing meaning |
| --- | --- | --- |
| Invalid JSON, URL, or field type | 400 / INVALID_INPUT | Enter a valid YouTube video link. |
| Wrong content type | 415 / INVALID_CONTENT_TYPE | Send JSON. |
| Oversized request | 413 / INPUT_TOO_LARGE | The submitted input is too large. |
| No captions | 422 / NO_CAPTIONS | No captions are available for this video. |
| Private, deleted, restricted, or unplayable | 422 / VIDEO_UNAVAILABLE | This video cannot be accessed. |
| YouTube blocking/rate restriction | 503 / UPSTREAM_BLOCKED | YouTube is blocking requests from this server. Try later. |
| Deadline reached | 504 / TIMEOUT | Caption retrieval took too long. Try again. |
| Network or upstream parsing failure | 502 / RETRIEVAL_FAILED | Captions could not be retrieved right now. |
| Per-IP count/concurrency limit | 429 / RATE_LIMITED | Wait before retrying; include Retry-After. |
| Global capacity reached | 503 / BUSY | The service is busy. Try shortly. |
| Oversized transcript | 422 / TRANSCRIPT_TOO_LARGE | This transcript exceeds the current size limit. |
| Unexpected internal failure | 500 / INTERNAL_ERROR | Something went wrong. |

An unavailable selected language must not become `NO_CAPTIONS` while other tracks exist. A block must not be described as missing captions. Keep raw exception details, signed caption URLs, and stack traces out of responses. Logs may record categories and elapsed time, not transcript content.

Done when: deadline cancellation works, temporary failures are retryable, and unavailable-caption/invalid-input states are distinct from temporary failures.

### Step 6 — Format paragraphs conservatively

1. Normalize whitespace inside snippets. Preserve words, punctuation, capitalization, existing speaker labels, and meaningful non-speech annotations. Consume plain text from the library; decode entities only if inspection proves the library has not already decoded them.
2. Preserve source ordering. Do not sort blindly or deduplicate repeated phrases across unrelated timestamps.
3. Remove rolling-caption overlap only when overlapping time ranges and an exact repeated text sequence establish duplication. A single repeated word is insufficient. When uncertain, retain the words.
4. Join text with appropriate spacing, avoiding spaces before closing punctuation and unnecessary word spaces in scripts that do not use them. Built-in locale-aware segmentation is preferable to another dependency; retain a safe fallback.
5. Target about 600 characters per paragraph, ending at nearby sentence boundaries. A pause of at least two seconds may end a paragraph once it has 200 characters. After roughly 1,000 characters, allow a break at a safe word/segment boundary even without punctuation. Never cut a word or truncate the transcript.
6. Separate paragraphs with one blank line. These are readability heuristics, not topic understanding. Add no punctuation, rewritten prose, headings, or inferred speaker labels.
7. Display and copy the same final string. Check its UTF-8 byte size and report oversize output explicitly.

Done when: manual inspection covers a long podcast, unpunctuated automatic captions, repeated spoken words, overlapping rolling captions, and non-English text. First and last content survive; timestamps and metadata are absent.

### Step 7 — Enforce simple in-memory limits

1. Use a module-scoped IP map in the single Node process, with the default rolling window and capacity settings above. Expire idle keys and bound map size.
2. Validate inputs before charging an attempt. Acquire per-IP/global active slots before upstream work. Charge each admitted discovery/transcription request once; capacity rejections do not consume an extra attempt.
3. Release active slots in `finally` on every outcome, including language-choice responses, exceptions, and timeout. A failed request must not permanently occupy a slot.
4. Disable duplicate submission in the browser; the backend still enforces limits independently.
5. Resolve client IP from the real connection locally. For the VPS reverse proxy, accept a forwarded address only when that proxy overwrites the chosen header and untrusted callers cannot bypass it. Do not trust arbitrary forwarded headers sent by a browser.
6. If proxy configuration is unknown, retain loopback binding and document the required proxy setup before public exposure. Keep this single-instance design; no Redis, distributed locks, or account tracking.

Done when: concurrent/repeated requests are limited, cooldown feedback is clear, and errors release capacity. Document that process restart resets limits and multiple replicas are outside scope.

### Step 8 — Build the page and interaction states

Use a light background, centered layout around 900px wide, one URL field, Transcribe, and a large text region. Use scoped CSS for typography, spacing, borders, responsive behavior, and visible focus. No decorative dashboard, images, navigation system, or dark-mode toggle is needed.

| State | Required behavior |
| --- | --- |
| Idle | Input and Transcribe available; output empty; Copy unavailable. |
| Loading | Disable duplicate submission/language changes; show “Fetching captions…”; mark result region busy. |
| Language needed | Explain uncertainty; show labeled selector; preserve URL; allow submission. |
| Success | Display full paragraph text and Copy; allow a new video. |
| Failure | Inline explanation; preserve URL; enable appropriate retry/change. |
| Copy feedback | Announce “Copied”, or tell the visitor to select and copy manually if clipboard access fails. |

Render text through text APIs, not `innerHTML`. A read-only textarea or plain-text region may be used; preserve blank lines and wrap long lines. Copy uses the Clipboard API in response to a user click. Production needs HTTPS for normal clipboard operation.

Clear stale output and disable Copy at the start of a new submission. Clear obsolete language choices when the URL changes. Handle non-JSON proxy/server errors and always exit loading in cleanup. Store no transcript in localStorage, sessionStorage, cookies, or analytics.

Use visible field labels, keyboard-operable controls, polite status announcements, and readable errors. Stack controls on narrow screens and avoid horizontal page scrolling.

Done when: paste → request → optional language choice → paragraphs → copy works with keyboard and pointer; copied content exactly matches output.

### Step 9 — Replace prototype deployment files

1. Use a multi-stage Docker build for the selected Node release. Install from the lockfile with `npm ci`, build Astro, and copy the actual server output, client assets, and required runtime dependencies. Inspect adapter output rather than assuming all dependencies are bundled.
2. Run as non-root, listen on `0.0.0.0:3000` inside the container, and start the built standalone server. Health-check `/health` using Node, without a YouTube request or curl dependency.
3. Replace the existing Python-specific `.dockerignore` allowlist. Include application/build inputs; exclude secrets, `.git`, local node_modules, Python environments, and prototype material.
4. Keep the Compose service and deployment pattern. Default host mapping is loopback port 3000 with configurable host port. Make development Compose run Astro's dev server and preserve container dependencies when source is mounted.
5. Rewrite the root README for npm commands, Docker, configuration, health, and VPS deployment. Label the Python probe historical.
6. Retain the SSH workflow using `VPS_HOST`, `VPS_USER`, and `VPS_SSH_PRIVATE_KEY`, deployment directory `~/youtube-transcriber`, fast-forward pull from `main`, and Compose rebuild with health waiting. Serialize deployments and make failures visible. Avoid global image cleanup and unrelated VPS changes.

Done when: Compose validation succeeds, the image actually builds when Docker is available, and the running container serves health and the page at localhost:3000. If Docker is unavailable, report container testing incomplete; a direct Node run does not prove it.

### Step 10 — Minimal verification and local handoff

Run `npm run check` and `npm run build`. Use the manual checklist below and focused temporary checks for error paths. Do not add a broad test framework, coverage gate, or automated browser suite yet.

- [ ] Multi-hour podcast includes text through its final spoken section.
- [ ] Automatic captions and a non-English sample work.
- [ ] Ambiguous language asks for a choice; manual captions win within that choice.
- [ ] Invalid links are rejected without upstream access.
- [ ] Missing captions, blocking, timeout, and network failure have appropriate distinct feedback.
- [ ] Wording, paragraph breaks, and repeated spoken words are preserved.
- [ ] Copy excludes metadata/timestamps and has failure feedback.
- [ ] Limits work and failed requests free capacity.
- [ ] Long output, keyboard use, and narrow layouts are usable.
- [ ] Build and container verification pass, or exact blockers are recorded.

For hard-to-trigger failures, use a controlled local simulation and label it as simulated evidence. Record real sample IDs, versions, environment, and observed results. Distinguish tested, simulated, untested, and VPS outcomes.

Done when: a working local app and concise verification report are available for the user's review. Stop adding features; broader tests wait for feedback.

## 3. Deployment phase, when destination details exist

The user will add the Git remote later. Do not invent a remote, create an unsolicited repository, or claim a push occurred while it is absent.

1. Verify the supplied remote, working tree, and `main` branch. Preserve history/user changes; never force push.
2. Confirm the VPS checkout at `~/youtube-transcriber`, pull credentials, Docker engine, and Compose health-wait support. Repository secrets use the user's normal secret mechanism, not committed files.
3. Confirm a free port and the public hostname/reverse proxy. Configure HTTPS, trusted forwarded IP handling, and proxy timeout greater than the app deadline (for example 75 seconds). Ask for the hostname when needed; it is currently unspecified.
4. When deployment is authorized, push `main`, inspect the Actions outcome, and verify health. SSH connection success alone is not app deployment success.
5. Repeat the same caption samples from the actual VPS, including long podcasts, manual/automatic captions, and different languages. Repeat at modest volume in a later window; record timing, coverage, and failures.
6. If requests are consistently blocked, report evidence and return to the user. Keep free-only operation and the selected library; paid services or a manual library replacement require a new decision.

Done when: deployment and VPS retrieval are independently verified or precisely reported as blocked. This initial workflow does not include automatic rollback or high availability.

## 4. References

Read installed package types and current official documentation when implementing; API names and runtime requirements may change.

- [Astro Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/)
- [Astro endpoints](https://docs.astro.build/en/guides/endpoints/)
- [Astro scoped CSS](https://docs.astro.build/en/guides/styling/)
- [Selected caption library](https://github.com/hallelx2/youtube-transcript-ts)
- [Paragraph readability reference](https://lexfridman.com/dhh-2-transcript): not its timestamps, headings, metadata, or human editing.

The caption library documents track discovery, manual/generated selection, and custom fetch support. Verify these capabilities against the installed version. Its hosting claims are guidance, not measurements for this VPS. Its examples involving paid services, translation, and proxy fallbacks are outside the agreed scope.
