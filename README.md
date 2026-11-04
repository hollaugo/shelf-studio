# Shelf Studio

Turns one product image into approved, retailer-ready images, video and copy for Amazon, Walmart, Target and verda.com. **It generates the scene, never the product:** every asset carries the real packshot's pixels, and nothing ships without a person's approval.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run seed                 # loads the SKU sheet, channel specs, style guide and legal rules
npm run dev
```

Apply `supabase/migrations/*` to your Supabase project first. Then open http://localhost:3000. Use the switcher in the header to act as Producer, Reviewer or Owner.

Checks: `npm test`, `npm run lint`, `npm run build`.

## The flow

1. **Upload** a product image. Claude streams a structured analysis, and a mask is applied to the original pixels to cut out the real pack.
2. **Generate** one channel or all, with a credit estimate. Assets run in parallel within your account's live Runway limits.
3. **Write copy.** The agent loads a channel skill, drafts, validates, fixes and saves, streaming each field.
4. **Refine.** Change a background (agent suggestions, or describe your own) or add on-brand text. Every edit is a new version.
5. **Check.** The pre-compliance report combines measured checks with vision review.
6. **Approve or reject** as a reviewer, with feedback and a toggle for whether the agent regenerates.
7. **Publish** to the sample website at `/verda`. Marketplaces, Salsify and DAM are shown as not connected.

## Architecture

| Area | Where | Notes |
|---|---|---|
| Pipeline | `src/lib/pipeline/tick.ts` | One idempotent step, safe to call concurrently. The open page or a cron drives it, so no long-lived process is needed |
| State machine | `src/lib/domain/` | Pure and tested: transitions, failure policy, permissions, what each card shows |
| Compositing | `src/lib/pipeline/compose.ts` | Real cutout on the scene, shadows, exact channel encoding |
| Agent | `src/lib/agent/` | AI SDK `ToolLoopAgent`, channel skills in Markdown, validators in code |
| Checks | `src/lib/pipeline/checks.ts` | Pixels, spec and fill are measured. Style and legal rules are judged by vision |
| Data | `supabase/migrations/` | Shot list and channel specs are rows, so a new SKU or retailer needs no code |
| Website | `src/app/(site)/` | Only shows published assets |

**Rate limits:** concurrency and daily limits are read from Runway's organization endpoint. Dispatch stays under them, `THROTTLED` and 429s show as queued, retries follow Runway's failure codes with backoff, and `RUNWAY_CREDIT_CAP_PER_RUN` stops a run from overspending.

**Fidelity:** the agent's prompts ask for empty scenes. A vision step picks where the product stands. The check compares output pixels with the approved cutout, typically about 1.4 of 255 on real assets, which is JPEG noise.

## Credits

Typical costs, from Runway's pricing:

| Item | Credits |
|---|---|
| Cutout, once per product | 7 |
| Main image, Claim card | 0 |
| Lifestyle or In-use scene, 2K | 11 each |
| Video, 5 s `gen4.5` | 60 |

All channels for one product cost 33 credits in scenes, plus 60 per video, because channels with the same ratio share a scene. The full test run for VRD-1001 used 111 credits, including a rejected and regenerated In-use image and one video.

Research behind these choices, with sources, is in [`docs/RESEARCH.md`](docs/RESEARCH.md).

## Before this goes further

- **No sign-in.** Roles are a demo switcher, and API routes trust that cookie. Don't deploy publicly until real auth is in.
- **Public storage.** Generated images use unguessable but public URLs, including unapproved ones.
- **Channel limits** come from third-party summaries. Check them against Seller Central and each retailer's docs.
- **Legal rules are starting defaults**, not legal advice. Your legal team should replace them in Settings.
- **Cron:** for runs to continue with no page open on Vercel, schedule `GET /api/pipeline/tick` with `CRON_SECRET`. Frequent crons need a paid plan.
