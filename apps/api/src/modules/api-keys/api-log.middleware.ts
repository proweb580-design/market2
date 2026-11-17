import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from '../../common/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * Records every call made with an API key (also the refused ones) once the response is sent.
 * The principal is read at `finish` time, after AuthGuard has set it. Only the path is stored — query strings may carry personal data.
 */
@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ApiLog');
  constructor(private readonly db: PrismaService) {}

  use(req: AppRequest, res: Response, next: NextFunction) {
    const started = Date.now();
    res.once('finish', () => {
      const principal = req.principal;
      if (principal?.kind !== 'apiKey') return;
      this.db.apiLog
        .create({
          data: {
            apiKeyId: principal.apiKey.id,
            method: req.method,
            path: (req.originalUrl ?? req.url).split('?')[0]!.slice(0, 300),
            statusCode: res.statusCode,
            durationMs: Date.now() - started,
            ip: req.ip,
          },
        })
        .catch((error: unknown) => this.logger.warn(`api log write failed: ${String(error)}`));
    });
    next();
  }
}
