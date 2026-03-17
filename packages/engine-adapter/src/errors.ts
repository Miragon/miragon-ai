export class EngineApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly endpoint: string,
  ) {
    super(`Engine API error [${status}] on ${endpoint}: ${message}`);
    this.name = 'EngineApiError';
  }
}
