export class RavatarApiError extends Error {
  statusCode?: number;
  response?: unknown;

  constructor(
    message: string,
    statusCode?: number,
    response?: unknown
  ) {
    super(message);
    this.name = 'RavatarApiError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class NetworkError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}
