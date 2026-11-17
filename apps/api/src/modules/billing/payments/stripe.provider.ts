import Stripe from 'stripe';
import {
  type CheckoutRequest,
  type CheckoutResult,
  type CheckoutState,
  type PaymentProvider,
  ProviderError,
  type ProviderEvent,
  type RefundResult,
  WebhookSignatureError,
} from './payment-provider.js';

const CHECKOUT_TTL_MINUTES = 30; // Stripe's minimum session lifetime is 30 minutes

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null));

function mapCheckout(eventType: string, s: Stripe.Checkout.Session): CheckoutState['outcome'] {
  if (eventType === 'checkout.session.expired' || s.status === 'expired') return 'expired';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return 'paid';
  return 'pending'; // e.g. bank transfers: completed now, paid later via async_payment_succeeded
}

function mapRefundStatus(status: string | null): RefundResult['status'] {
  if (status === 'succeeded') return 'SUCCEEDED';
  if (status === 'failed' || status === 'canceled') return 'FAILED';
  return 'PENDING';
}

/** Stripe Checkout (hosted page) in payment mode — card data never touches our servers. */
export class StripeProvider implements PaymentProvider {
  readonly code = 'stripe';

  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string | undefined,
  ) {}

  private checkoutState(eventId: string, eventType: string, s: Stripe.Checkout.Session): CheckoutState {
    return {
      id: eventId,
      type: eventType,
      kind: 'checkout',
      providerPaymentId: s.id,
      outcome: mapCheckout(eventType, s),
      amountMinor: s.amount_total === null ? null : BigInt(s.amount_total),
      currency: s.currency ? s.currency.toUpperCase() : null,
      providerTransactionId: idOf(s.payment_intent),
    };
  }

  async createCheckout(input: CheckoutRequest): Promise<CheckoutResult> {
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: { currency: input.currency.toLowerCase(), unit_amount: Number(input.amountMinor), product_data: { name: input.title } },
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.paymentId,
          customer_email: input.customerEmail ?? undefined,
          metadata: { paymentId: input.paymentId, organizationId: input.organizationId },
          payment_intent_data: { metadata: { paymentId: input.paymentId } },
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_MINUTES * 60,
        },
        // Retrying our call can never create a second session for the same payment.
        { idempotencyKey: `checkout:${input.paymentId}` },
      );
      if (!session.url) throw new ProviderError('Stripe returned no checkout URL');
      return { providerPaymentId: session.id, checkoutUrl: session.url, expiresAt: new Date(session.expires_at * 1000) };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(error instanceof Error ? error.message : 'Stripe error');
    }
  }

  async getCheckout(providerPaymentId: string): Promise<CheckoutState> {
    const session = await this.stripe.checkout.sessions.retrieve(providerPaymentId);
    return this.checkoutState(`sync:${session.id}`, 'checkout.session.retrieved', session);
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent {
    if (!this.webhookSecret) throw new WebhookSignatureError('STRIPE_WEBHOOK_SECRET is not configured');
    if (!signature) throw new WebhookSignatureError('Missing Stripe-Signature header');
    let event: Stripe.Event;
    try {
      // Signature over the exact raw bytes + 5-minute timestamp tolerance (replay protection).
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new WebhookSignatureError('Invalid signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        return this.checkoutState(event.id, event.type, event.data.object as Stripe.Checkout.Session);
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        const r = event.data.object as Stripe.Refund;
        const pi = idOf(r.payment_intent);
        if (!pi) return { id: event.id, type: event.type, kind: 'ignored' };
        return {
          id: event.id,
          type: event.type,
          kind: 'refund',
          refundId: r.id,
          providerTransactionId: pi,
          amountMinor: BigInt(r.amount),
          currency: r.currency.toUpperCase(),
          status: event.type === 'refund.failed' ? 'FAILED' : mapRefundStatus(r.status),
        };
      }
      default:
        return { id: event.id, type: event.type, kind: 'ignored' };
    }
  }

  async refund(providerTransactionId: string, amountMinor: bigint, idempotencyKey: string): Promise<RefundResult> {
    try {
      const r = await this.stripe.refunds.create({ payment_intent: providerTransactionId, amount: Number(amountMinor) }, { idempotencyKey });
      return { refundId: r.id, status: mapRefundStatus(r.status) };
    } catch (error) {
      throw new ProviderError(error instanceof Error ? error.message : 'Stripe error');
    }
  }
}
