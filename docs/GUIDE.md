# Guide

The reference behind the [README](../README.md).

## The steps in detail

1. **Start from a product.** Products come from the catalog with their images and sheet. To add a new one, provide the front and back images, plus its product sheet as a file (PDF, TXT, CSV, TSV, JSON or Markdown), pasted text or typed fields. Claude reads it into fields, and a person confirms them before they're saved. This product database is the source of truth for all copy.
2. **Generate.** Pick one channel or all of them, with a credit estimate up front. The first run also reads the pack and cuts it out. In-use images show a moment of real use for that kind of product, worked out from its directions, with the pack standing clear of the person. Assets run in parallel within the Runway account's live rate limits, and channels with the same ratio share a scene.
3. **Write copy.** An AI SDK agent loads the channel's skill, drafts the listing, validates it, fixes what fails and saves it. Generating a channel starts this automatically.
4. **Refine.** Change a background, add text or edit the video. Every edit creates a new version of the asset, and earlier versions stay on record.
5. **Check.** Pixels, specs and fill are measured in code. Style and legal rules are judged by vision review. Text drawn by a model is read back and compared word by word.
6. **Review.** A producer submits the PDP, which freezes it. A reviewer sees it as one page, confirms any flagged checks, and either approves it or flags the items that need work. The next version regenerates only those items and reuses the rest.
7. **Publish.** An approved version goes live as a set, on the sample website at `/verda`, and replaces the previous live version. Any earlier live version can be restored. Marketplaces, Salsify and DAM are shown as not connected.

The product page previews each channel as a retailer-style page, so you can see how the images and copy look together before review. Evals, at `/lab`, compares models on a saved prompt library, without touching real assets.

## PDPs

A PDP is what gets made, reviewed and published. Each product has one PDP per channel, and each PDP has numbered versions.

| Status | Meaning |
|---|---|
| Draft | Being worked on, and assets can change |
| In review | Frozen, with the reviewer |
| Changes requested | Sent back, with a new draft regenerating the flagged items |
| Approved | Cleared to go live |
| Live | In use on the channel. There's only ever one |
| Replaced | Kept as a record, and can be restored if it has been live |

Assets carry generation and check states only. `pdp_items` records exactly which assets a version held when it was submitted. Video is optional, so a PDP can be submitted without one.

## The catalog

The product list comes from a product database, which stands in for a tool like Salsify. Each product arrives with its base images, claims and product sheet, so creating its assets only takes pressing **Generate**.

`npm run catalog` loads `supabase/seed-assets/product-sheet.json` and the images in `supabase/seed-assets/catalog/`. The sheet's ingredients, directions and barcodes come from the packs. The Travel Trio's ingredient lists come from the full-size products, because its pack doesn't print any. Descriptions, warnings and prices are demo values, and the barcodes wouldn't pass a retailer's check-digit validation.

**Add new product** is for anything not in the catalog. It walks through the two images and the product sheet.

## Signing in

The app and its API sit behind one shared demo account. The sample website at `/verda` stays public, because it only shows published assets. The username and password come from environment variables and are never stored in the repo.

The header's switcher changes between three demo roles, all available to anyone signed in:

| Role | Can do |
|---|---|
| Producer | Generate, refine, submit and publish |
| Reviewer | Approve and reject |
| Owner | Everything a producer can, plus change settings |

## Metrics

The Metrics page at `/metrics` is for the Owner role, and is calculated live from the app's own records.

| Metric | How it's measured |
|---|---|
| Time to publish | Average time from a product being added to each of its PDPs first going live |
| Cost per SKU | Runway credits per product that has spent any, without Evals spend or Claude tokens |
| Review rounds | Average decisions per PDP, across all its versions |
| First-pass approval | Share of reviewed PDPs approved at their first review |
| Time saved | The previous turnaround you enter on the page, minus the time to publish |
| Conversion lift | Empty until a conversion data source is connected |

## Models

| Job | Model | Credits |
|---|---|---|
| Lifestyle and in-use images, with the pack | `gpt_image_2_5_sunburst` at high quality | 18 each, per attempt |
| Claim card, with the pack and type | `gpt_image_2_5_sunburst` at high quality | 19 each, per attempt |
| Scene alone, if a producer switches to the real pack | `nano_banana_2.1` at 2K | 6 each |
| Text added to an image by a producer | `gpt_image_2_5_sunburst` at max quality | 63 each, 64 with a reference image |
| Text in images, exact lettering drawn by code | None | 0 |
| Main image | None, the real packshot on white | 0 |
| Cutout mask, once per product | `gemini_image3.1_flash` at 1K | 7 |
| Video, 5 s at 1080p, from the Lifestyle image | `klingO3_pro` | 85 |
| Video edit, 5 s | `aleph2` | 140 |
| Analysis, copy and vision checks | `claude-opus-5-5` | Claude tokens |

All four channels for one product cost about 80 credits in images, including the cutout, plus 18 or 19 for each label that has to be redrawn and 85 for each video. Earlier model research is in [`RESEARCH.md`](RESEARCH.md). The table above shows what's in use today.

## Deploy to Vercel

Set these for the Production environment, then deploy:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only database access, which bypasses Row Level Security |
| `RUNWAYML_API_SECRET` | Image and video generation |
| `ANTHROPIC_API_KEY` | Analysis, copy and checks |
| `RUNWAY_CREDIT_CAP_PER_RUN` | Stops a channel run from overspending |
| `DEMO_USERNAME`, `DEMO_PASSWORD` | The demo account |
| `AUTH_SECRET` | Signs session cookies. Changing it signs everyone out |
| `CRON_SECRET` | Optional, for a scheduled pipeline tick |

```bash
vercel deploy --prod
```

The open page drives the pipeline, so runs pause when nobody has it open. To keep them moving, schedule `GET /api/pipeline/tick` with `CRON_SECRET`. Frequent crons need a paid Vercel plan.

## Architecture

| Area | Where | Notes |
|---|---|---|
| Sign-in | `src/proxy.ts`, `src/lib/auth/` | A signed session cookie, checked on every request |
| Pipeline | `src/lib/pipeline/tick.ts` | One idempotent step, safe to call concurrently, so no long-lived process is needed |
| State machines | `src/lib/domain/` | Pure and tested: asset and PDP transitions, failure policy, permissions and next steps |
| PDP lifecycle | `src/lib/pipeline/pdp.ts` | Submit, approve, request changes, publish and restore |
| Rendering | `src/lib/pipeline/compose.ts`, `blend.ts` | Encodes each asset to its channel's exact spec. Main images and fallbacks place the real cutout |
| Drawn images | `src/lib/pipeline/inspect-pack.ts`, `claim-card.ts`, `src/lib/domain/pack-check.ts` | Reads labels back, measures shape and colour, and sets claim card type |
| Agent | `src/lib/agent/` | AI SDK `ToolLoopAgent`, channel skills in Markdown and validators in code |
| Checks | `src/lib/pipeline/checks.ts` | Measured checks plus vision review |
| Metrics | `src/lib/domain/metrics.ts`, `/metrics` | Pure calculations, tested separately from the data they read |
| Evaluation | `src/lib/eval/`, `/lab` | Scored comparisons of image, text, video, copy, analysis and cutout models |
| Data | `supabase/seed-assets/`, `scripts/seed.mjs` | The shot list, channel specs and SKU sheet are data, so a new SKU or retailer needs no code |
| Website | `src/app/(site)/` | Only shows published assets |

**Stack:** Next.js 16, AI SDK 7, Claude, Runway, Supabase, sharp and Tailwind 4.

**Rate limits:** concurrency and daily limits are read from Runway's organization endpoint. Dispatch stays under them, `THROTTLED` responses and 429s show as queued, and retries follow Runway's failure codes with backoff.

## Known limits

This is a demo, not a production system.

- **One shared account.** Roles are a switcher, so they show the workflow but don't enforce who can do what. Real use needs individual accounts.
- **Real money behind the login.** Anyone signed in can spend Runway credits and Claude tokens. `RUNWAY_CREDIT_CAP_PER_RUN` covers channel runs, but not one-off videos and refinements.
- **Public storage.** Generated images use unguessable but public URLs, including unapproved ones.
- **Video isn't checked automatically.** The app can't decode frames on serverless, so a person always reviews video. A push-in from a real first frame keeps labels far steadier than an orbit, which made the model invent views of the pack.
- **Channel limits** come from third-party summaries. Check them against Seller Central and each retailer's docs.
- **Legal rules are starting defaults**, not legal advice. Your legal team should replace them in Settings.
