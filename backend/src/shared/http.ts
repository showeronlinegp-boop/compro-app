import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express request handler so that any thrown error is forwarded
 * to the next() error middleware. Eliminates boilerplate try/catch in routes.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Sends a JSON response with the given status code and body.
 * Defaults to 200 if no status is provided.
 */
export function sendJson(res: Response, body: unknown, status = 200): void {
  res.status(status).json(body);
}
