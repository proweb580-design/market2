import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './principal.js';

/** Correlates a request across logs and error responses. Client-sent ids are ignored (log forging). */
export function requestId(req: AppRequest, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
