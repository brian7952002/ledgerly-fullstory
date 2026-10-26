# Ledgerly Tracking Plan (Fullstory)

One wrapper (`public/js/analytics.js`) sends every browser call, so this plan is enforced in code, not by convention.

## Naming conventions
| Thing | Convention | Example |
|---|---|---|
| Event names | Object + past-tense action, Title Case | `Signup Completed` |
| Property names | snake_case | `billing_period` |
| Property values | lowercase snake_case | `fall_promo_50off` |
| Acquisition (first touch) | `acq_` prefix, user property | `acq_campaign` |
| Experiment assignment | `exp_<experiment_key>`, user property | `exp_pricing_page_v2` |

Pages are **not** custom events. Fullstory captures page views natively, and the reserved `pageName` page property names them.

## Properties by scope
| Scope | Property | Set when | Why this scope |
|---|---|---|---|
| User | `acq_campaign`, `acq_source`, `acq_medium` | First visit (first touch only) | Segment people by the campaign that acquired them |
| User | `exp_pricing_page_v2` | Variant actually rendered | Segment people by experiment arm, across sessions |
| User | `plan`, `billing_period`, `mrr_usd` | Signup (browser), trial end (**server**) | Revenue state comes from billing, the system of record |
| Page | `pageName` (Fullstory reserved) | Every page load, and every in-app view change (`app_dashboard`, `app_invoices`, `app_clients`, `app_billing`) | Names the Page in Fullstory automatically; no manual Page setup |
| Event | `campaign`, `variant`, `page_name` | Added to every event by the wrapper | Last-touch context at the moment of action |

First touch on the **user** plus last touch on **events** gives Marketing both attribution views without extra tooling.

## Events
| Event | Source | Properties (plus campaign, variant, page_name) | Business question |
|---|---|---|---|
| `Experiment Viewed` | browser | `experiment_key`, `variant` | Who was really in the test? (exposure, not assignment) |
| `CTA Clicked` | browser | `cta_id`, `billing_period` | Does the message drive intent? |
| `Billing Period Toggled` | browser | `from`, `to` | Do people want monthly? (Only fires when the toggle works) |
| `Signup Started` | browser | `billing_period` | Form friction (started vs completed) |
| `Signup Completed` | browser | `plan`, `billing_period` | What the A/B tool optimizes for |
| `First Invoice Sent` | browser | `invoice_amount_bucket` | Activation, the leading indicator of paying |
| `Upgrade Clicked` | browser | `billing_period` | Upgrade *intent* in the app. Compare with Trial Converted (what billing confirms) |
| `Trial Converted` | **Server API** | `plan`, `billing_period`, `mrr_usd`, `billing_txn_id`, `campaign`, `variant` | The outcome Marketing actually cares about |
| `Trial Expired` | **Server API** | `invoices_sent`, `campaign`, `variant` | Lost revenue, by campaign and variant |

## Identity
- Anonymous until signup, then `FS('setIdentity', { uid })` with the **internal CRM id** (`usr_…`). Never email.
- The billing system uses the same `uid` in the Server API, so browser behavior and offline revenue land on one user.

## Privacy
- `fs-exclude` on password (never recorded). `fs-mask` on name, email, business, client name.
- No PII in event or user properties, UTMs, or URLs. Invoice amounts are bucketed.
- Production: load the snippet only after consent (out of scope for the POC).

Server events have no browser session, so billing stamps `campaign` and `variant` (from the CRM) onto them. That lets them be grouped by campaign and variant like the browser events.
