import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Per-API-key fixed-window limiter.
 * shortcut: in-memory, so the limit is per API instance — move to Redis (INCR + EXPIRE) before running >1 instance (phase 10).
 */
@Injectable()
export class ApiKeyRateLimiter {
  private readonly windows = new Map<string, { windowStart: number; count: number }>();

  hit(keyId: string, limitPerMinute: number, now = Date.now()) {
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const current = this.windows.get(keyId);
    const w = current && current.windowStart === windowStart ? current : { windowStart, count: 0 };
    w.count += 1;
    this.windows.set(keyId, w);
    if (this.windows.size > 10_000) this.sweep(windowStart);

    if (w.count > limitPerMinute) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + 60_000 - now) / 1000));
      throw new HttpException(
        { message: 'API key rate limit exceeded', details: { retryAfterSeconds: retryAfter } },
        HttpStatus.TOO_MANY_REQUESTS,
        { cause: { retryAfter } },
      );
    }
  }

  private sweep(currentWindow: number) {
    for (const [id, w] of this.windows) if (w.windowStart < currentWindow) this.windows.delete(id);
  }
}
