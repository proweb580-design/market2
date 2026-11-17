/**
 * Contract every payment provider implements. PaymentsService only speaks this language, so adding a
 * provider (YooKassa, Payme, Click, Telegram Payments …) means one new class — no changes to billing logic.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CheckoutRequest {
  paymentId: string;
  organizationId: string;
  amountMinor: bigint;
  /** ISO 4217, upper case. */
  currency: string;
  title: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}

export interface CheckoutResult {
  providerPaymentId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type CheckoutOutcome = 'paid' | 'pending' | 'failed' | 'expired';

/** Provider events normalised to what billing cares about. Anything else is `ignored`. */
export type ProviderEvent =
  | { id: string; type: string; kind: 'checkout'; providerPaymentId: string; outcome: CheckoutOutcome; amountMinor: bigint | null; currency: string | null; providerTransactionId: string | null }
  | { id: string; type: string; kind: 'refund'; refundId: string; providerTransactionId: string; amountMinor: bigint; currency: string; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' }
  | { id: string; type: string; kind: 'ignored' };

export type CheckoutState = Extract<ProviderEvent, { kind: 'checkout' }>;

export interface RefundResult {
  refundId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}

export interface PaymentProvider {
  readonly code: string;
  createCheckout(input: CheckoutRequest): Promise<CheckoutResult>;
  /** Asks the provider directly — used when the buyer returns before the webhook arrives. */
  getCheckout(providerPaymentId: string): Promise<CheckoutState>;
  /** Verifies the signature over the raw body and normalises the event. Throws WebhookSignatureError. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent;
  refund(providerTransactionId: string, amountMinor: bigint, idempotencyKey: string): Promise<RefundResult>;
}

export class WebhookSignatureError extends Error {}
export class ProviderError extends Error {}
