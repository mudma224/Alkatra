/**
 * Shape of NestJS's default ValidationPipe / HttpException error body.
 * Not rendered directly to the user (see guide §14) — kept for future logging.
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}