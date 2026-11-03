export type Language = { code: string; label: string };
export type TranscriptResponse =
  | { status: 'success'; text: string; languageCode: string; isGenerated: boolean }
  | { status: 'language_required'; languages: Language[]; message?: string }
  | { status: 'error'; code: string; message: string; retryable: boolean; retryAfterSeconds?: number };
export type Segment = { text: string; startSeconds: number; durationSeconds: number };
