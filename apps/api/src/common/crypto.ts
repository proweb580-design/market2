import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** URL-safe random token with `bytes` bytes of entropy from the OS CSPRNG. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string) {
  const [x, y] = [Buffer.from(a, 'hex'), Buffer.from(b, 'hex')];
  return x.length === y.length && timingSafeEqual(x, y);
}
