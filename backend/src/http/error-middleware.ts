import type { NextFunction, Request, Response } from 'express';

/**
 * Central Express error handler (4-argument signature).
 * Catches any error thrown or passed via next(err) in route handlers.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[error]', err.message);
  res.status(500).json({ error: err.message });
}
