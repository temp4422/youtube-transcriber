import type { TranscriptResponse } from '../lib/contracts';
const form = document.querySelector<HTMLFormElement>('#transcribe-form')!;
const input = document.querySelector<HTMLInputElement>('#video-url')!;
const submit = document.querySelector<HTMLButtonElement>('#transcribe-button')!;
const buttonLabel = document.querySelector<HTMLElement>('#button-label')!;
const languageContainer = document.querySelector<HTMLElement>('#language-container')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const status = document.querySelector<HTMLElement>('#status')!;
const result = document.querySelector<HTMLElement>('#result')!;
const transcript = document.querySelector<HTMLTextAreaElement>('#transcript')!;
const empty = document.querySelector<HTMLElement>('#empty-state')!;
const detail = document.querySelector<HTMLElement>('#result-detail')!;
const copy = document.querySelector<HTMLButtonElement>('#copy-button')!;
const copyLabel = document.querySelector<HTMLElement>('#copy-label')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status')!;
let busy = false;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function announce(message: string, error = false) {
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle('error', error);
}
function clearResult() {
  transcript.value = '';
  transcript.hidden = true;
  empty.hidden = false;
  copy.disabled = true;
  clearTimeout(copyTimer);
  copyLabel.textContent = 'Copy text';
  copyStatus.textContent = '';
  detail.textContent = 'Just the words. Nothing extra.';
}
input.addEventListener('input', () => {
  languageContainer.hidden = true;
  language.replaceChildren(new Option('Choose a language', ''));
  language.required = false;
  clearResult();
  announce('');
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  clearResult();
  submit.disabled = input.disabled = language.disabled = true;
  buttonLabel.textContent = 'Working…';
  result.setAttribute('aria-busy', 'true');
  announce('Fetching captions… Long conversations are welcome.');
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.value.trim(), ...(!languageContainer.hidden && language.value ? { languageCode: language.value } : {}) }),
      signal: AbortSignal.timeout(65_000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server could not complete the request. Please try again.');
    const data = await response.json() as TranscriptResponse;
    if (data.status === 'error') {
      const wait = data.retryAfterSeconds ? ` Try again in about ${data.retryAfterSeconds} seconds.` : '';
      announce(data.message + wait, true);
    } else if (data.status === 'language_required') {
      language.replaceChildren(new Option('Choose a language', ''));
      for (const option of data.languages) language.add(new Option(option.label, option.code));
      languageContainer.hidden = false;
      language.required = true;
      announce(data.message ?? 'Choose the caption language for this video.');
    } else if (data.status === 'success' && typeof data.text === 'string' && data.text.trim()) {
      transcript.value = data.text;
      transcript.hidden = false;
      empty.hidden = true;
      copy.disabled = false;
      detail.textContent = `${data.languageCode.toUpperCase()} · ${data.isGenerated ? 'Automatic captions' : 'Creator-provided captions'}`;
      announce('Your transcript is ready.');
    } else throw new Error('The server returned an unreadable response. Please try again.');
  } catch (error) {
    announce(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'Caption retrieval took too long. Please try again.' : error instanceof Error ? error.message : 'Could not connect. Please try again.', true);
  } finally {
    busy = false;
    submit.disabled = input.disabled = language.disabled = false;
    buttonLabel.textContent = 'Transcribe';
    result.setAttribute('aria-busy', 'false');
    if (!languageContainer.hidden && !language.value) language.focus();
  }
});
copy.addEventListener('click', async () => {
  const text = transcript.value;
  if (!text || busy) return;
  try {
    await navigator.clipboard.writeText(text);
    if (transcript.value !== text || busy) return;
    copyLabel.textContent = 'Copied';
    copyStatus.textContent = 'Transcript copied to clipboard.';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyLabel.textContent = 'Copy text'; copyStatus.textContent = ''; }, 2500);
  } catch {
    if (busy || transcript.value !== text) return;
    transcript.focus();
    transcript.select();
    copyStatus.textContent = 'Clipboard access is unavailable. The text is selected; use your device’s Copy command.';
  }
});
