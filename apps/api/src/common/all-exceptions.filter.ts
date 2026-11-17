import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { AppRequest } from './principal.js';

/** Postgres/Prisma failures that are the client's fault, mapped to proper statuses instead of 500s. */
function mapDatabaseError(error: unknown): { status: number; message: string } | null {
  const e = error as { code?: string; message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  const pgCode = e?.meta?.driverAdapterError?.cause?.originalCode;
  if (e?.code === 'P2002' || pgCode === '23505') return { status: HttpStatus.CONFLICT, message: 'Already exists' };
  if (e?.code === 'P2025') return { status: HttpStatus.NOT_FOUND, message: 'Not found' };
  if (e?.code === 'P2003' || pgCode === '23503') {
    return { status: HttpStatus.CONFLICT, message: 'Operation blocked by related records' };
  }
  if (pgCode === '23514' || /check_violation|violates check constraint/i.test(e?.message ?? '')) {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Value rejected by a database rule' };
  }
  return null;
}

/** One error shape for the whole API; never leaks stack traces, SQL or driver messages. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<AppRequest>();
    const res = http.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as { message?: unknown; details?: unknown };
        message = Array.isArray(b.message) ? b.message.join('; ') : String(b.message ?? exception.message);
        details = b.details;
      }
    } else {
      const mapped = mapDatabaseError(exception);
      if (mapped) ({ status, message } = mapped);
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status} [${req.requestId}]`, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      statusCode: status,
      message,
      ...(details ? { details } : {}),
      requestId: req.requestId,
    });
  }
}
