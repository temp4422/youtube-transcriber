export type Language = { code: string; label: string };
export type TranscriptResponse =
  | {
      status: 'success';
      text: string;
      languageCode: string;
      isGenerated: boolean | null;
      languages: Language[];
    }
  | {
      status: 'error';
      code: string;
      message: string;
      retryable: boolean;
      retryAfterSeconds?: number;
    };
export type Segment = {
  text: string;
  startSeconds: number;
  durationSeconds: number;
};
