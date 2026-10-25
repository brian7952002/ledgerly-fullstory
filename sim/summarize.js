// Prints the funnel from the mock CRM/billing data (data/db.json).
// It is a sanity check that the simulation produced the planted story. In the demo,
// these same numbers are shown from inside Fullstory, not from here.
import fs from 'node:fs';

const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : 0);

const byVariant = {};
for (const e of Object.values(db.exposures)) (byVariant[e.variant] ??= { exposures: 0, signups: 0, activated: 0, paid: 0 }).exposures++;
const byCampaign = {};
for (const u of db.users) {
  const v = byVariant[u.variant];
  const c = (byCampaign[u.acq_campaign] ??= { signups: 0, activated: 0, paid: 0 });
  for (const row of [v, c].filter(Boolean)) {
    row.signups++;
    if (u.invoices_sent > 0) row.activated++;
    if (u.plan === 'pro' || u.dry_run_outcome === 'pro') row.paid++;
  }
}

const variants = Object.entries(byVariant).map(([variant, r]) => ({
  variant, ...r,
  signup_rate: pct(r.signups, r.exposures),
  paid_per_exposure: pct(r.paid, r.exposures),
  trial_to_paid: pct(r.paid, r.signups),
}));
const campaigns = Object.entries(byCampaign).map(([campaign, r]) => ({
  campaign, ...r,
  activation_rate: pct(r.activated, r.signups),
  trial_to_paid: pct(r.paid, r.signups),
}));

// Inside annual_toggle: people who fought the broken Monthly toggle vs everyone else.
const paid = (u) => u.plan === 'pro' || u.dry_run_outcome === 'pro';
const toggleUsers = db.users.filter((u) => u.variant === 'annual_toggle');
const blocked = [true, false].map((w) => {
  const g = toggleUsers.filter((u) => !!u.wanted_monthly === w);
  return { group: w ? 'hit_broken_toggle' : 'did_not', signups: g.length, paid: g.filter(paid).length, trial_to_paid: pct(g.filter(paid).length, g.length) };
});

console.table(variants);
console.table(campaigns);
console.table(blocked);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ variants, campaigns, blocked }, null, 2));
