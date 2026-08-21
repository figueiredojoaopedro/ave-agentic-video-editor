export class ProviderError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderHttpError extends ProviderError {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`provider returned HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'ProviderHttpError';
  }
}
