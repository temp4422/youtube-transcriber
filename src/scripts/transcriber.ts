import type { TranscriptResponse } from '../lib/contracts';
const form = document.querySelector<HTMLFormElement>('#transcribe-form')!;
const input = document.querySelector<HTMLInputElement>('#video-url')!;
const submit = document.querySelector<HTMLButtonElement>('#transcribe-button')!;
const buttonLabel = document.querySelector<HTMLElement>('#button-label')!;
const languageContainer = document.querySelector<HTMLElement>(
  '#language-container',
)!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const status = document.querySelector<HTMLElement>('#status')!;
const result = document.querySelector<HTMLElement>('#result')!;
const transcript = document.querySelector<HTMLTextAreaElement>('#transcript')!;
const detail = document.querySelector<HTMLElement>('#result-detail')!;
const copy = document.querySelector<HTMLButtonElement>('#copy-button')!;
const copyLabel = document.querySelector<HTMLElement>('#copy-label')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status')!;
const REQUEST_TIMEOUT_MS = 65_000;
const COPY_FEEDBACK_MS = 2500;

let busy = false;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function announce(message: string, error = false) {
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle('error', error);
}
function setBusy(value: boolean) {
  busy = value;
  submit.disabled = input.disabled = language.disabled = value;
  buttonLabel.textContent = value ? 'Working…' : 'Transcribe';
  result.setAttribute('aria-busy', String(value));
}
function resetCopyFeedback() {
  clearTimeout(copyTimer);
  copyLabel.textContent = 'Copy text';
  copyStatus.textContent = '';
}
function clearResult() {
  transcript.value = '';
  transcript.hidden = true;
  result.hidden = true;
  copy.disabled = true;
  resetCopyFeedback();
  detail.textContent = '';
}
input.addEventListener('input', () => {
  languageContainer.hidden = true;
  language.replaceChildren(new Option('Automatic', ''));
  clearResult();
  announce('');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const requestedLanguage = language.value;
  clearResult();
  setBusy(true);
  announce('Fetching captions…');
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: input.value.trim(),
        ...(requestedLanguage ? { languageCode: requestedLanguage } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error(
        'The server could not complete the request. Please try again.',
      );
    const data = (await response.json()) as TranscriptResponse;
    if (data.status === 'error') {
      const wait = data.retryAfterSeconds
        ? ` Try again in about ${data.retryAfterSeconds} seconds.`
        : '';
      announce(data.message + wait, true);
    } else if (
      data.status === 'success' &&
      typeof data.text === 'string' &&
      data.text.trim()
    ) {
      transcript.value = data.text;
      transcript.hidden = false;
      result.hidden = false;
      language.replaceChildren(
        new Option('Automatic', ''),
        ...data.languages.map(
          (option) => new Option(option.label, option.code),
        ),
      );
      language.value = data.languages.some(
        (option) => option.code === requestedLanguage,
      )
        ? requestedLanguage
        : '';
      languageContainer.hidden = data.languages.length < 2;
      copy.disabled = false;
      detail.textContent = `${data.languageCode.toUpperCase()} · ${data.isGenerated ? 'Automatic captions' : 'Creator-provided captions'}`;
      announce('Your transcript is ready.');
    } else
      throw new Error(
        'The server returned an unreadable response. Please try again.',
      );
  } catch (error) {
    announce(
      error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'Caption retrieval took too long. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Could not connect. Please try again.',
      true,
    );
  } finally {
    setBusy(false);
  }
});
language.addEventListener('change', () => form.requestSubmit());
copy.addEventListener('click', async () => {
  const text = transcript.value;
  if (!text || busy) return;
  try {
    await navigator.clipboard.writeText(text);
    if (transcript.value !== text || busy) return;
    copyLabel.textContent = 'Copied';
    copyStatus.textContent = 'Transcript copied to clipboard.';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(resetCopyFeedback, COPY_FEEDBACK_MS);
  } catch {
    if (busy || transcript.value !== text) return;
    transcript.focus();
    transcript.select();
    copyStatus.textContent =
      'Clipboard access is unavailable. The text is selected; use your device’s Copy command.';
  }
});
