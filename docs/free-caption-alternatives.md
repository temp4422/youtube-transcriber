# Free caption retrieval on the existing VPS

Research date: 2026-11-05. Scope: analysis only; no implementation or VPS experiments performed by this research task.

Live diagnostic results supplied by the coordinating agent: the original ANDROID player requests were blocked for `MyFKybHCdjE` and `NYFGCESmikA`. Watch-page HTML returned player status `LOGIN_REQUIRED` and zero caption tracks; a WEB player request using version/visitor data from the page also returned `LOGIN_REQUIRED`. The watch page contained transcript-endpoint parameters, but a minimal WEB `get_transcript` request returned HTTP 400, `Precondition check failed`, with zero segments. This does not establish that a complete YouTube.js session would fail. IPv6 connectivity was available, but the IPv6 watch request also returned `LOGIN_REQUIRED` without tracks. No production configuration was changed. These results strengthen the upstream-access diagnosis and provide no evidence that simply switching to IPv6 fixes it.

## What the existing failure means

The reported `LOGIN_REQUIRED` / “Sign in to confirm you’re not a bot” response from `youtubei/v1/player` establishes an upstream refusal for the tested request, not that captions are absent. It does not by itself prove that every endpoint or client is blocked. Invidious documents both unofficial-client detection and datacenter IP blocking as causes of the same message. Therefore IP reputation is a strong hypothesis, but the current evidence cannot distinguish it from client/session detection. [Invidious troubleshooting](https://docs.invidious.io/youtube-errors-explained/)

Inference: changing the site's public domain, Nginx configuration, frontend CORS headers, or package name does not change the VPS's outbound identity to YouTube. Keeping this VPS and domain is compatible with all options below, but no source establishes a guaranteed free, unattended solution for arbitrary videos from this exact IP.

## Most useful experiments

### 1. YouTube.js transcript route

Try a small isolated probe using the maintained `youtubei.js` package: `getInfo(videoId)` followed by `getTranscript()`. Source inspection shows that `getInfo` obtains both player and watch-next responses; `getTranscript()` reads the searchable-transcript engagement panel from the latter and follows its continuation. It does not simply download the player's caption-track URL. Consequently this is a meaningfully different route to test. However, `getInfo()` still makes a player request; calling it a guaranteed player bypass would be wrong. `getBasicInfo()` alone cannot provide the next response required for transcripts. [Innertube source](https://raw.githubusercontent.com/LuanRT/YouTube.js/main/src/Innertube.ts), [MediaInfo source](https://raw.githubusercontent.com/LuanRT/YouTube.js/main/src/core/mixins/MediaInfo.ts)

Assessment: best lightweight Node-native experiment. No service fee; ongoing dependency/parser maintenance. Success must be measured on the VPS, including repeated requests and different caption types.

### 2. Current yt-dlp with subtitle-only retrieval

yt-dlp supports listing subtitles, manual subtitles, automatic subtitles, language selection, and skipping video downloads. First inspect available languages, then request just the relevant language; avoid requesting every translated track. Illustrative diagnostic commands, not executed here:

```sh
yt-dlp --skip-download --list-subs 'https://www.youtube.com/watch?v=VIDEO_ID'
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs 'en' --sub-format vtt 'https://www.youtube.com/watch?v=VIDEO_ID'
```

[yt-dlp options](https://github.com/yt-dlp/yt-dlp#subtitle-options)

If default clients fail, assess the currently documented PO-token setup. The guide distinguishes player, media/GVS, and subtitle token contexts; its current table marks `web` subtitles as requiring a token, whereas `mweb` is listed for GVS. Do not assume a streaming token automatically fixes subtitle requests. yt-dlp recommends a provider plugin and `mweb` for problematic default downloads, but this is not a promise that a blocked datacenter IP will work. [PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)

Assessment: good second experiment, with more deployment dependencies than a Node library. Start without account cookies. Cookies add rotation and operational burden, and yt-dlp warns about account suspension risk; they are not a universal IP-block remedy. [YouTube extractor notes](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#youtube)

## Other approaches and their limits

| Option | What is available | Assessment for this case |
| --- | --- | --- |
| Self-host Invidious | `/api/v1/captions/:id` and caption metadata | More infrastructure to operate. Same VPS egress remains, and its own troubleshooting documents this exact error. Not the first experiment. |
| Self-host Piped | `/streams/:videoId` returns subtitle URLs | An alternate extraction stack, not evidence that the IP restriction disappears. More infrastructure than a focused extractor. |
| Public Invidious/Piped APIs | Free instances may expose those APIs | Could move retrieval to another operator's IP while retaining the website, but availability and operator access policy must be checked. Do not treat volunteer instances as a guaranteed production backend or assume documented example instances still work. |
| Official YouTube Data API | Caption listing and downloading | Download requires permission to edit the video and OAuth authorization. Suitable for authorized owned/managed videos, not arbitrary public URLs. |
| Headless browser on VPS | Real browser session | May help a client/session problem; still uses VPS egress. Higher RAM and maintenance. Not a reliable IP-block fix. |
| Browser extension/local helper | Retrieval happens on the user's device | Keeps the site and VPS, but changes the interaction model. Useful when the browser can show the transcript; no guarantee every user's network works. |
| Paste/upload transcript | User supplies copied text or subtitle file | Most dependable no-service-fee fallback because the application no longer needs to retrieve that transcript from YouTube. Requires user action. |

Sources for service interfaces: [Invidious API](https://docs.invidious.io/api/), [Piped API](https://docs.piped.video/docs/api-documentation/). Operational limitations are assessments, not availability tests. Invidious explicitly says its suggested unblock approaches carry no guarantee. [Troubleshooting](https://docs.invidious.io/youtube-errors-explained/)

The official API's `captions.list` returns metadata rather than caption text and costs 50 quota units; `captions.download` costs 200 and requires edit permission. An API key alone does not solve arbitrary-video retrieval. [List API](https://developers.google.com/youtube/data/reference/rest/v3/captions/list), [Download API](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)

Moving an ordinary website's fetch into the browser is not a drop-in solution: cross-origin reads depend on the remote origin's policy. Chrome documents that extension service workers can make cross-origin requests with appropriate host permissions, while content scripts remain constrained by the page's origin. An extension can collect transcript text locally and send only that text to the existing site; it need not export a user's YouTube cookies to the VPS. This is an architectural suggestion, not a tested implementation. [Chrome extension network documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

## Suggested decision sequence

1. Compare the same small set of videos on this VPS and a normal local connection. Separate upstream block, unavailable captions, and parser errors.
2. Probe YouTube.js's transcript flow and current yt-dlp subtitle-only flow independently, without replacing the application yet.
3. If a flow works consistently, integrate it with caching by video/language, low concurrency, request deduplication, bounded retries, and explicit blocked-versus-no-caption errors. These controls reduce unnecessary requests; they cannot guarantee access.
4. If both remain blocked, keep the VPS/domain and add paste/upload or an optional local/extension helper. A fully automatic, arbitrary-video, same-egress requirement has no verified dependable free solution in these sources.

Avoid presenting changes in user agent, DNS, domain, cookies, PO tokens, or free public proxies as certain fixes. A self-hosted speech recognizer is also not a direct caption-retrieval replacement: it still needs accessible audio and sufficient compute.
