// ============================================================================
// POST /api/revenue/webhook — Stripe webhook handler
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createHmac } from 'crypto';

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret) return false;

  const parts = signature.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigPart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !sigPart) return false;

  const timestamp = timestampPart.slice(2);
  const expectedSig = sigPart.slice(3);

  // Check timestamp freshness (reject events older than 5 minutes)
  const eventTime = parseInt(timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - eventTime) > 300) return false;

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const computedSig = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  if (computedSig.length !== expectedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedSig.length; i++) {
    mismatch |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature') ?? '';

    // Verify webhook signature
    if (STRIPE_WEBHOOK_SECRET) {
      const isValid = verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      if (!isValid) {
        console.error('[api:revenue/webhook] Invalid Stripe signature');
        return NextResponse.json(
          { success: false, error: 'Invalid webhook signature' },
          { status: 401 },
        );
      }
    }

    let event: {
      id: string;
      type: string;
      data: {
        object: Record<string, unknown>;
      };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 },
      );
    }

    if (!event.type || !event.data?.object) {
      return NextResponse.json(
        { success: false, error: 'Invalid event structure' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Process different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(db, session);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentSuccess(db, paymentIntent);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handleInvoicePaid(db, invoice);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionChange(db, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCancelled(db, subscription);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        await handleRefund(db, charge);
        break;
      }

      default: {
        // Log unhandled event types
        console.log(`[webhook] Unhandled event type: ${event.type}`);
      }
    }

    // Log the webhook event
    await db.from('webhook_logs').insert({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
      processed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, data: { received: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:revenue/webhook] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutComplete(
  db: ReturnType<typeof getDb>,
  session: Record<string, unknown>,
): Promise<void> {
  const customerEmail = (session.customer_email as string) ?? '';
  const amountTotal = ((session.amount_total as number) ?? 0) / 100;
  const paymentId = (session.payment_intent as string) ?? (session.id as string) ?? '';

  // Try to find the product from metadata or line items
  const metadata = (session.metadata as Record<string, string>) ?? {};
  const productId = metadata.product_id;

  if (productId && amountTotal > 0) {
    await db.from('revenue_events').insert({
      product_id: productId,
      amount: amountTotal,
      currency: ((session.currency as string) ?? 'usd').toUpperCase(),
      type: 'one_time',
      customer_email: customerEmail,
      stripe_payment_id: paymentId,
      utm_source: metadata.utm_source ?? null,
      utm_medium: metadata.utm_medium ?? null,
      utm_campaign: metadata.utm_campaign ?? null,
    });
  }
}

async function handlePaymentSuccess(
  db: ReturnType<typeof getDb>,
  paymentIntent: Record<string, unknown>,
): Promise<void> {
  const amount = ((paymentIntent.amount as number) ?? 0) / 100;
  const paymentId = (paymentIntent.id as string) ?? '';
  const metadata = (paymentIntent.metadata as Record<string, string>) ?? {};

  // Check if we already have this event (avoid duplicates from checkout.session.completed)
  const { data: existing } = await db
    .from('revenue_events')
    .select('id')
    .eq('stripe_payment_id', paymentId)
    .limit(1);

  if (existing && existing.length > 0) return;

  if (metadata.product_id && amount > 0) {
    await db.from('revenue_events').insert({
      product_id: metadata.product_id,
      amount,
      currency: ((paymentIntent.currency as string) ?? 'usd').toUpperCase(),
      type: 'one_time',
      customer_email: metadata.customer_email ?? '',
      stripe_payment_id: paymentId,
      utm_source: metadata.utm_source ?? null,
      utm_medium: metadata.utm_medium ?? null,
      utm_campaign: metadata.utm_campaign ?? null,
    });
  }
}

async function handleInvoicePaid(
  db: ReturnType<typeof getDb>,
  invoice: Record<string, unknown>,
): Promise<void> {
  const amount = ((invoice.amount_paid as number) ?? 0) / 100;
  const customerEmail = (invoice.customer_email as string) ?? '';
  const paymentId = (invoice.payment_intent as string) ?? (invoice.id as string) ?? '';
  const metadata = (invoice.metadata as Record<string, string>) ?? {};

  if (amount > 0) {
    await db.from('revenue_events').insert({
      product_id: metadata.product_id ?? '',
      amount,
      currency: ((invoice.currency as string) ?? 'usd').toUpperCase(),
      type: 'recurring',
      customer_email: customerEmail,
      stripe_payment_id: paymentId,
      utm_source: metadata.utm_source ?? null,
      utm_medium: metadata.utm_medium ?? null,
      utm_campaign: metadata.utm_campaign ?? null,
    });
  }
}

async function handleSubscriptionChange(
  db: ReturnType<typeof getDb>,
  subscription: Record<string, unknown>,
): Promise<void> {
  const subscriptionId = (subscription.id as string) ?? '';
  const status = (subscription.status as string) ?? '';
  const metadata = (subscription.metadata as Record<string, string>) ?? {};

  await db.from('subscriptions').upsert(
    {
      stripe_subscription_id: subscriptionId,
      status,
      product_id: metadata.product_id ?? null,
      customer_email: metadata.customer_email ?? '',
      current_period_start: subscription.current_period_start
        ? new Date((subscription.current_period_start as number) * 1000).toISOString()
        : null,
      current_period_end: subscription.current_period_end
        ? new Date((subscription.current_period_end as number) * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );
}

async function handleSubscriptionCancelled(
  db: ReturnType<typeof getDb>,
  subscription: Record<string, unknown>,
): Promise<void> {
  const subscriptionId = (subscription.id as string) ?? '';

  await db
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);
}

async function handleRefund(
  db: ReturnType<typeof getDb>,
  charge: Record<string, unknown>,
): Promise<void> {
  const amountRefunded = ((charge.amount_refunded as number) ?? 0) / 100;
  const paymentId = (charge.payment_intent as string) ?? (charge.id as string) ?? '';
  const metadata = (charge.metadata as Record<string, string>) ?? {};

  if (amountRefunded > 0) {
    await db.from('revenue_events').insert({
      product_id: metadata.product_id ?? '',
      amount: amountRefunded,
      currency: ((charge.currency as string) ?? 'usd').toUpperCase(),
      type: 'refund',
      customer_email: metadata.customer_email ?? '',
      stripe_payment_id: `refund_${paymentId}`,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    });
  }
}
