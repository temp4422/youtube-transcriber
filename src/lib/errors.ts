export class AppError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  constructor(status: number, code: string, message: string, retryable = false, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
