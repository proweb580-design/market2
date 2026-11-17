import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  authDate: Date;
  /** startapp parameter from the deep link, if any. */
  startParam?: string;
  /** The signed hash — unique per Mini App launch, used for replay protection. */
  hash: string;
}

export class InitDataError extends Error {}

/**
 * Validates Telegram Mini App initData exactly as Telegram specifies:
 *   secret = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   hash   = hex(HMAC_SHA256(key = secret, message = data_check_string))
 * where data_check_string = every received field except `hash` (incl. `signature`), as key=value, sorted, joined by "\n".
 * Nothing in initData is trusted until this passes — the Telegram user id comes only from here.
 */
export function verifyInitData(initData: string, botToken: string, maxAgeSec: number, now = Date.now()): VerifiedInitData {
  if (!initData || initData.length > 8192) throw new InitDataError('initData missing or too long');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError('hash missing');

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(pairs.join('\n')).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new InitDataError('bad signature');

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSec) || authDateSec <= 0) throw new InitDataError('auth_date invalid');
  const ageSec = now / 1000 - authDateSec;
  if (ageSec > maxAgeSec) throw new InitDataError('initData expired');
  if (ageSec < -60) throw new InitDataError('auth_date in the future');

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    throw new InitDataError('user missing');
  }
  if (!user || typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) throw new InitDataError('user invalid');

  return { user, authDate: new Date(authDateSec * 1000), startParam: params.get('start_param') ?? undefined, hash };
}
