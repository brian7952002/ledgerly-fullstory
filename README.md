# Ledgerly × Fullstory: did the campaign (or the experiment) actually make money?

A proof of concept for the Fullstory Solutions Architect challenge.

**Stakeholder:** Marketing.
**Question:** "How do our campaigns and experiments affect behavior, and do they produce the conversions we intended?"

**Ledgerly** is a made-up, product-led invoicing app for freelancers: a 14-day free trial that converts to Pro at $19/mo (or $15/mo billed annually).

## The problem
Marketing judges campaigns by signups (ad platforms) and experiments by signup rate (the A/B tool). Revenue happens 14 days later in billing, and **nobody sees behavior**. So the team ships "winners" that lose money and never learns why.

## The solution in one picture
```
 Browser (Ledgerly site)                         Fullstory
 ├─ attribution.js  UTMs → acq_* user props  ─┐
 ├─ experiment.js   variant → exp_* + event  ─┼─ Browser API ──►  sessions, frustration signals,
 └─ analytics.js    one wrapper for all calls ─┘                  segments, funnels, dashboards
                                                                        ▲
 Node backend (server.js)                                               │
 ├─ mock CRM:     /api/signup → uid (also used in setIdentity)          │
 ├─ mock A/B tool: /api/exposure, /api/experiment/readout               │
 └─ mock billing:  trial ends → lib/fs-server.js ──── Server API v2 ────┘
                   Trial Converted / Trial Expired + plan, mrr_usd (same uid)
```

| | Real | Mocked |
|---|---|---|
| Fullstory snippet + Browser API (`setIdentity`, `setProperties`, `trackEvent`) | ✅ | |
| Fullstory Server API v2 (users upsert, events, idempotency keys) | ✅ | |
| Site, signup, first-invoice flow | ✅ | |
| Experimentation platform, CRM, billing | | ✅ (`server.js`, `lib/billing.js`) |
| Traffic | | ✅ Playwright personas (`sim/simulate.js`), synthetic and planted |

The event schema and naming rules are in [tracking-plan.md](tracking-plan.md).

**Live site:** https://brian7952002.github.io/ledgerly-fullstory/ (GitHub Pages, static mode)
Try it with a campaign link: `https://brian7952002.github.io/ledgerly-fullstory/?utm_source=instagram&utm_medium=paid_social&utm_campaign=fall_promo_50off`

**Static mode:** on GitHub Pages there's no Node server. The mock CRM hands out user ids in the browser, and the ops console (A/B readout + billing) runs only locally. Billing outcomes still reach Fullstory: run `npm start` locally, then `BASE_URL=https://brian7952002.github.io/ledgerly-fullstory npm run simulate`. The simulator reports each visitor to the local server, then **Run billing cycle** on `localhost:3000/ops` sends the outcomes through the Server API. The API key never leaves your machine.

## Run it
```bash
npm install
cp .env.example .env      # add FS_ORG_ID and FS_API_KEY
npm start                 # http://localhost:3000
```
- Site: `/` → `/pricing` → `/signup` → `/app`. Add UTMs to the URL, e.g. `/?utm_source=instagram&utm_medium=paid_social&utm_campaign=fall_promo_50off`.
- Force a variant: `/pricing?variant=annual_toggle`. Forced visits are left out of the A/B readout. Show the fix: `/pricing?variant=annual_toggle&fix=toggle` (the real fix is one line: `month` → `monthly`).
- Start as a brand-new visitor: add `?reset=1` to any URL. It clears Ledgerly's local state and anonymizes the Fullstory session. Or use a private window.
- Ops console (the out-of-Fullstory demo): `/ops`. It shows the A/B tool readout and a **Run billing cycle** button that pushes outcomes to Fullstory.
- Generate traffic: `npm run simulate` (options: `SESSIONS=150`, `CONCURRENCY=3`, `HEADLESS=1`). It uses the installed Microsoft Edge. **Set `FS_ORG_ID` first**, or the sessions are never recorded.
- Sanity-check the story: `node sim/summarize.js` prints the funnel by variant and by campaign.
- Without `FS_API_KEY`, the Server API calls run in **dry-run** mode. They print their payloads and leave trials open, so the real run later still sends everything. With a key, a trial only closes when Fullstory accepts the call. Re-running is safe because of the idempotency keys and fixed timestamps.

Every Fullstory call is logged in the browser console as `[FS] …`, so you can see exactly what is sent.

## What gets built in Fullstory
1. **Segments:** one per `acq_campaign` and per `exp_pricing_page_v2` variant.
2. **Funnel:** Experiment Viewed → CTA Clicked → Signup Completed → First Invoice Sent → Trial Converted, broken down by variant and by campaign.
3. **Metrics:** rage-click and error-click rate on the Pricing page, by variant.
4. **Replay:** an annual_toggle user rage-clicking "Monthly".
5. **Dashboard:** a "Campaign & Experiment Scorecard" that pins all of the above.

## The planted story (the data is synthetic, and this is said up front)
- The A/B tool says **annual_toggle wins** on signups.
- Fullstory shows it **loses on paid conversion**. The "Monthly" toggle throws a JS error (`PLANS["monthly"]` is undefined), so users who want monthly billing rage-click, can't pick it, and end up on an annual price they didn't choose. In the mock billing, only those blocked users convert worse, so "rage-clicked vs didn't" is a real split inside Fullstory.
- `fall_promo_50off` brings the most signups but the fewest paying customers. `accountant_partner` is the reverse.

## Key decisions
- **Client vs server events:** behavior is captured in the browser. Revenue comes from billing via the Server API, so ad blockers can't drop it and the client can't fake it.
- **Exposure, not assignment:** `Experiment Viewed` fires only when the variant renders.
- **Identity:** the internal `uid` is shared by the browser and billing. It is never an email.
- **Privacy:** `fs-exclude` on passwords, `fs-mask` on PII, no PII in properties or URLs.
- **One wrapper:** it enforces the tracking plan and makes a future CDP swap a one-file change.
- **Deliberately out:** Segment / warehouse export (phase 2), a real experiment SDK, a stats engine, auth and payments.
