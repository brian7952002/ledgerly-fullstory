// MOCK billing system. In real life this is Stripe/Chargebee firing a webhook
// when a trial ends. The conversion odds below are SYNTHETIC and deliberately
// planted so the demo has a story to find - say so in the presentation.
import crypto from 'node:crypto';
import { upsertUser, createEvent, fsServerEnabled } from './fs-server.js';

const CAMPAIGN_BASE = { fall_promo_50off: 0.15, accountant_partner: 0.5, direct: 0.3 };
// The penalty lands only on people who wanted monthly billing and couldn't pick it
// (they hit the broken toggle): sticker shock on an annual price they didn't choose.
const BLOCKED_FROM_MONTHLY = 0.3;
const PRICE = { monthly: 19, annual: 15 }; // MRR in USD
const TRIAL_DAYS = 14;

// Deterministic "random" per user so re-running a cycle gives the same answer.
const roll = (uid) => crypto.createHash('sha256').update(uid).digest().readUInt32BE(0) / 2 ** 32;

const ok = (r) => typeof r.status === 'number' && r.status < 300;

export async function runBillingCycle(users) {
  const log = [];
  for (const u of users.filter((x) => x.plan === 'trial')) {
    const activated = u.invoices_sent > 0;
    const blocked = u.variant === 'annual_toggle' && u.wanted_monthly;
    const p = (CAMPAIGN_BASE[u.acq_campaign] ?? 0.3) * (blocked ? BLOCKED_FROM_MONTHLY : 1) * (activated ? 1.5 : 0.4);
    const converted = roll(u.uid) < p;
    const txn = `txn_${u.uid}_trial_end`;
    // Trial end, never in the future (simulated trials are compressed), stored on the user so
    // an idempotent retry sends a byte-identical body.
    const due = new Date(u.signed_up_at).getTime() + TRIAL_DAYS * 864e5;
    u.trial_end_at ??= new Date(Math.min(Date.now(), due)).toISOString();
    const timestamp = u.trial_end_at;

    let props, event, eventProps;
    if (converted) {
      const billing_period = u.billing_period || 'monthly';
      props = { plan: 'pro', billing_period, mrr_usd: PRICE[billing_period] };
      event = 'Trial Converted';
      eventProps = { ...props, billing_txn_id: txn };
    } else {
      props = { plan: 'expired' };
      event = 'Trial Expired';
      eventProps = { invoices_sent: u.invoices_sent };
    }

    const results = [
      await upsertUser(u.uid, props),
      await createEvent(u.uid, event, eventProps, { timestamp, idempotencyKey: txn }),
    ];
    log.push(...results);
    // Only close the trial when Fullstory accepted it, so a failed call can be retried by
    // running the cycle again. Dry-run (no key) records the outcome but leaves the trial open.
    if (!fsServerEnabled()) u.dry_run_outcome = props.plan;
    else if (results.every(ok)) u.plan = props.plan;
  }
  return log;
}
