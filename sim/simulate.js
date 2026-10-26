// Traffic simulator: drives real browser sessions through the site so Fullstory has
// data to analyze. Behavior odds are SYNTHETIC and planted to create the demo story.
//
//   npm run simulate                  -> 60 sessions, visible browser
//   SESSIONS=150 npm run simulate
//   HEADLESS=1 npm run simulate       -> faster (UA is normalized: Fullstory blocks "HeadlessChrome")
//   BASE_URL=https://brian7952002.github.io/ledgerly-fullstory npm run simulate
//                                     -> drive the GitHub Pages copy; visitors are reported to the
//                                        local server (npm start) so billing can still run
//
// Uses the Microsoft Edge already installed on Windows (no Playwright browser download).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SESSIONS = Number(process.env.SESSIONS || 60);
const HEADLESS = process.env.HEADLESS === '1';
const CHANNEL = process.env.BROWSER_CHANNEL || 'msedge';
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const LOCAL_API = process.env.LOCAL_API || 'http://localhost:3000';
const REMOTE = !BASE.startsWith(LOCAL_API);

const CAMPAIGNS = [
  { weight: 0.5, utm: 'utm_source=instagram&utm_medium=paid_social&utm_campaign=fall_promo_50off', key: 'fall_promo_50off' },
  { weight: 0.25, utm: 'utm_source=partner_newsletter&utm_medium=email&utm_campaign=accountant_partner', key: 'accountant_partner' },
  { weight: 0.25, utm: '', key: 'direct' },
];
// Promo traffic signs up readily but rarely does real work; partner traffic is the opposite.
const SIGNUP_BASE = { fall_promo_50off: 0.55, accountant_partner: 0.35, direct: 0.4 };
const ACTIVATE = { fall_promo_50off: 0.3, accountant_partner: 0.8, direct: 0.55 };
const VARIANT_SIGNUP_LIFT = { control: 1.0, annual_toggle: 1.18 }; // what the A/B tool will reward

const pick = (items) => {
  let r = Math.random();
  for (const it of items) if ((r -= it.weight) < 0) return it;
  return items[items.length - 1];
};
const pause = (page, min = 400, max = 1500) => page.waitForTimeout(min + Math.random() * (max - min));

async function visitor(browser, n) {
  const campaign = pick(CAMPAIGNS);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA });
  const page = await context.newPage();
  const result = { n, campaign: campaign.key };
  try {
    await page.goto(`${BASE}/${campaign.utm ? '?' + campaign.utm : ''}`);
    await pause(page, 800, 2500);
    if (Math.random() < 0.15) return Object.assign(result, { outcome: 'bounced' });

    await page.click('#cta-hero');
    await page.waitForURL('**/pricing');
    await pause(page, 800, 2000);
    const variant = await page.evaluate(() => Ledgerly.experiment.exposedVariant());
    result.variant = variant;

    // Many annual_toggle visitors want monthly billing and fight the broken toggle.
    if (variant === 'annual_toggle' && Math.random() < 0.6) {
      const monthly = page.locator('#billing-toggle > span[data-period="monthly"]');
      const clicks = 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < clicks; i++) { await monthly.click(); await page.waitForTimeout(80); }
      result.rage = true;
      await pause(page, 1000, 2500);
    }

    if (Math.random() > SIGNUP_BASE[campaign.key] * VARIANT_SIGNUP_LIFT[variant]) return Object.assign(result, { outcome: 'left_pricing' });

    await page.click(variant === 'control' ? '#cta-pricing' : '#cta-pricing-b');
    await page.waitForURL('**/signup**');
    await pause(page);
    await page.fill('input[name=name]', `Test Person ${n}`, { timeout: 5000 });
    await page.fill('input[name=email]', `sim${n}_${Date.now()}@example.com`);
    await page.fill('input[name=business]', `Studio ${n}`);
    await page.fill('input[name=password]', 'not-a-real-password');
    await pause(page);
    await page.click('button[type=submit]');
    await page.waitForURL('**/app');
    await pause(page, 1000, 3000);

    if (Math.random() > ACTIVATE[campaign.key]) return Object.assign(result, { outcome: 'signed_up' });

    await page.click('#cta-first-invoice');
    await pause(page, 500, 1200);
    await page.fill('input[name=client]', 'Acme Co');
    await page.fill('input[name=amount]', String(200 + Math.floor(Math.random() * 3000)));
    await pause(page);
    await page.click('#invoice-form button[type=submit]');
    // Some activated users look around and a few signal intent to upgrade.
    await pause(page, 800, 1600);
    await page.click('.sidebar a[data-route="invoices"]');
    await pause(page, 600, 1400);
    if (Math.random() < 0.35) {
      await page.click('.sidebar a[data-route="billing"]');
      await pause(page, 800, 1600);
      if (variant === 'control' || Math.random() < 0.5) await page.check('input[name=period][value=monthly]');
      else await page.check('input[name=period][value=annual]');
      await page.click('#cta-upgrade');
    }
    return Object.assign(result, { outcome: 'activated' });
  } catch (err) {
    return Object.assign(result, { outcome: 'error', error: err.message.split('\n')[0] });
  } finally {
    await page.waitForTimeout(2500); // let Fullstory flush its capture buffer
    if (REMOTE) result.storage = await page.evaluate(() => ({
      anon_id: localStorage.getItem('ledgerly_anon_id'),
      uid: localStorage.getItem('ledgerly_uid'),
      first_touch: JSON.parse(localStorage.getItem('ledgerly_first_touch') || '{}'),
      wanted_monthly: sessionStorage.getItem('ledgerly_wanted_monthly') === '1',
    })).catch(() => null);
    await context.close();
  }
}

// The static site has no backend: tell the local server what this visitor did.
async function report(r) {
  const s = r.storage;
  const post = (body) => fetch(`${LOCAL_API}/api/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.variant) await post({ exposure: { anon_id: s.anon_id, variant: r.variant } });
  if (s.uid) await post({ user: {
    uid: s.uid, anon_id: s.anon_id, acq_campaign: s.first_touch.campaign, acq_source: s.first_touch.source,
    variant: r.variant, billing_period: r.variant === 'control' ? 'monthly' : 'annual',
    wanted_monthly: s.wanted_monthly, invoices_sent: r.outcome === 'activated' ? 1 : 0,
  } });
}

const browser = await chromium.launch({ channel: CHANNEL, headless: HEADLESS });
// Fullstory drops traffic whose user agent says "HeadlessChrome" (reason: "Org blocks User Agent").
const UA = (await browser.newPage().then(async (p) => { const ua = await p.evaluate(() => navigator.userAgent); await p.close(); return ua; })).replace('HeadlessChrome', 'Chrome');
const tally = {};
let next = 1, rage = 0, toggleVisitors = 0;
async function worker() {
  while (next <= SESSIONS) {
    const r = await visitor(browser, next++);
    const key = `${r.campaign} / ${r.variant ?? '-'} / ${r.outcome}`;
    tally[key] = (tally[key] || 0) + 1;
    if (r.variant === 'annual_toggle') { toggleVisitors++; if (r.rage) rage++; }
    if (REMOTE && r.storage) await report(r).catch((e) => console.warn('report failed:', e.message));
    console.log(`#${r.n}`, r.campaign, r.variant ?? '-', r.outcome, r.rage ? '(rage)' : '', r.error ?? '');
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();
console.log(`Rage share: ${rage}/${toggleVisitors} annual_toggle pricing visitors fought the Monthly toggle.`);
console.table(Object.entries(tally).sort().map(([k, v]) => ({ path: k, sessions: v })));
console.log('Next: open /ops and click "Run billing cycle" to send trial outcomes to Fullstory.');
