import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Global exception filter — reproduces the Express errorMiddleware contract:
 * - HttpException: use its own status + { error: message }
 * - Any other error: 500 + { error: 'Internal server error' }
 * - headersSent guard: skip if response was already sent (fire-and-forget background)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (res.headersSent) {
      return;
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const message =
      exception instanceof Error
        ? isHttp
          ? exception.message
          : 'Internal server error'
        : 'Internal server error';

    console.error('[error]', exception instanceof Error ? exception.message : String(exception));
    res.status(status).json({ error: message });
  }
}
