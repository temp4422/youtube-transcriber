# Signed-out Chromium verification — 2026-11-05

Standalone Docker diagnostic; no changes deployed to Contabo or the web app.
Playwright 1.64.1, Chromium 156.0.8078.80, official Playwright Noble image pinned
by version and manifest digest. Each test used a new nonpersistent context with
no imported cookies or browser profile. Screenshots showed the signed-out UI.

| Video | Result | Segments | Text bytes | Last segment starts | Elapsed |
| --- | --- | ---: | ---: | --- | ---: |
| MyFKybHCdjE | retrieved | 99 | 14,902 | 15:36 | 5.2 s |
| NYFGCESmikA | retrieved | 2,282 | 289,778 | 5:15:31 | 7.1 s |

Both local Docker runs returned exit 0. Both player responses reported OK.
Text was extracted from the actual transcript panel. YouTube's current
`transcript-segment-view-model` elements differ from the older
`ytd-transcript-segment-renderer`; the script supports both. Initial runs using
only the older selector falsely reported failure; screenshots identified that
the transcript was in fact displayed. The final runs used the updated selector.

The output is the default transcript selected by YouTube, which may follow its
language/dubbing defaults. No translation action was requested. Segment counts
can differ from the underlying caption API because the UI groups text. The last
start time is a coverage signal, not an independently verified completeness
claim. DOM virtualization or future UI changes could affect extraction.

Artifacts (JSON, screenshot, transcript text) are in the git-ignored
`artifacts/chromium/` directory. Compose validation, JavaScript syntax check,
Docker image build, and both real signed-out retrieval tests passed.

The user will run the same Docker setup on Contabo. Local retrieval does not
establish server reliability; host networking/IP remains different.
