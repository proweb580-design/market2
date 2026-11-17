import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM envelope for secrets stored in the database (brands' bot tokens, provider keys).
 * Format "v1.<iv>.<tag>.<ciphertext>" (base64url). A stolen DB dump is useless without ENCRYPTION_KEY.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes');
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  /** Throws if the envelope was tampered with or sealed with another key. */
  open(envelope: string): string {
    const [version, iv, tag, ct] = envelope.split('.');
    if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret envelope');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }
}
