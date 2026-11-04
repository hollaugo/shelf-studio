# Model and channel research

Researched November 2026. Vendor docs are preferred; where only third-party summaries exist, that is stated. **Channel limits below come from third-party summaries and should be confirmed in Seller Central before real listings go live.** Legal rules are starting defaults, not legal advice.

## What we chose and why

| Job | Choice | Why |
|---|---|---|
| Scene images | `gemini_image3.1_flash` at 2K via Runway (11 credits) | Our own test of one empty-shelf prompt: cleanest usable surface in 12 s. `gen4_image` invented a mirror and cropped tightly (26 s). `gpt_image_2` medium was good but slow (45 s, 4.9 MB) |
| Product cutout | Generated mask + **real** packshot pixels (7 credits, once per product) | Flood-fill kept the cast shadow and struggles with a white cap on white. A model-only mask, applied to the original pixels, gave a clean edge and no invented product pixels |
| Video | `gen4.5` image-to-video, 5 s (12 credits/s) | Runway's guide recommends it for image-to-video and it stays faithful to the still. Veo 3.1 (40 credits/s with audio) is the upgrade path for hero ads |
| Image analysis, compliance review, copy | `claude-opus-5-5` through the AI SDK | Strong vision plus structured output |

In-context generation (`subject: "object"` reference) looked good but changed the cap and label details, which confirms the product rule: **generate the scene, never the product.**

## Rate limits (Runway)

Source: [usage tiers](https://docs.dev.runwayml.com/usage/tiers/). Read live from `GET /v1/organization` rather than hard-coded. This account currently allows 5 concurrent tasks per model and 2,000 image or 1,000 video generations a day.

- Over concurrency: the task is accepted as `THROTTLED`, no error. We still cap dispatch ourselves so the UI's queue is honest and one big run can't starve refinements.
- Over the daily limit: `429` at creation. We back off with jitter and retry, and show it as queued.
- Output URLs expire, so outputs are copied to Storage immediately.

## Prompting rules the agent follows

These live in `src/lib/agent/skills/prompting.md` and are loaded into prompt-writing calls.

**Images** ([OpenAI guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide), [Gemini guide](https://aistudio.google.com/docs/image-generation), [Runway references](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References))
- Order: intended use, shot type, setting, subject, details, constraints. Name the lighting, camera angle and lens.
- Say "photorealistic" and ask for real texture over studio gloss.
- For edits, say what changes and restate everything that must not.
- Reference images by tag (`@tag`, 3 to 16 characters). `gen4_image` prompts are limited to 1,000 characters.
- Put literal text in quotes, once. We avoid this entirely by rendering text ourselves.

**Video** ([Runway image-to-video guide](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide))
- Describe motion, camera and how action unfolds. Don't re-describe what's visible in the image.
- One scene per clip. Start minimal, then add subject motion and camera motion.
- Community guides advise positive phrasing, because negative prompts can backfire. That advice isn't from Runway.

**Voice-over, for later** ([ElevenLabs best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices))
- v3 and v4 use audio tags like `[excited]`, not SSML break tags. Ellipses add weight and pauses.
- When an LLM writes the script, spell out numbers and units: "72-hour" becomes "seventy-two hour", "400 mL" becomes "four hundred milliliters".
- Keep speed between 0.7 and 1.2, and test tags against the chosen voice.

Rankings of "best" models conflicted and mostly came from vendors, so we relied on our own test. Commonly recommended alternatives: GPT Image and Imagen 4 for product shots ([Morphed](https://morphed.app/blog/best-ai-image-generation-models), [Cliprise](https://www.cliprise.app/learn/guides/getting-started/best-ai-product-photography-ecommerce-image-generation-2026)), Veo 3.1 and Kling 3.0 for video ([Storista](https://storista.io/blog/best-ai-video-generators)). Most of them are also available through Runway's API, so swapping a model is a data change.

## Channel copy limits

| Field | Amazon | Walmart | Target | verda.com |
|---|---|---|---|---|
| Title | 75 chars | 150 max, 50 to 75 best | 150 max, 21 to 100 best | Meta title 60 |
| Short field | Item highlights 125 | Short description 500 | n/a | Meta description 155 |
| Bullets | 5, up to 500 each | 3 to 10, 80 each | 3 to 10, 120 each | n/a |
| Description | 2,000 | 150 words min, 4,000 max, no HTML | Plain text | Direct first sentence, FAQ |

Sources: Amazon's 75-character title and 125-character highlights from July 27, 2026 per [Nexscope](https://www.nexscope.ai/blog/amazon-listing-rules-july) and [SellerSprite](https://www.sellersprite.com/en/blog/amazon-75-character-title-limit-2026), citing Seller Central; bullets per [SellerSprite](https://sellersprite.ai/en/blog/Amazon-Bullet-Points-Guide-Optimize-for-SEO-and-Sales). Walmart per [LetterCounter](https://lettercounter.org/blog/walmart-marketplace-listing-limits/). Target per [LetterCounter](https://lettercounter.org/blog/target-plus-marketplace-limits/) and [ChannelEngine](https://support.channelengine.com/hc/en-us/articles/19136507076765).

**AEO:** keep visible facts and Product JSON-LD identical, open with what it is and who it's for, and answer real buyer questions. Google reportedly stopped showing FAQ rich results in May 2026, so FAQ markup is for machines rather than rich results ([Sayt](https://sayt.uz/en/blog/faq-schema-implementation)). Amazon's assistant reads titles, bullets and descriptions ([ZonGuru](https://zonguru.com/blog/how-amazon-rufus-recommends-products)).

## Cosmetic claims

Objective claims need competent and reliable evidence, and "clinically proven" needs the level of proof it advertises ([FTC](https://www.ftc.gov/business-guidance/blog/2014/06/ftc-loreal-scientific-claims-need-proof-thats-more-just-skin-deep)). Claims that treat a condition can make a cosmetic a drug in FDA's eyes; "appears thicker" is safer than "regrows hair" ([BakerHostetler](https://admin.bakerlaw.com/wp-content/uploads/2026/05/AD-Nauseam-Beauty-Claims-Youve-Got-the-Look.pdf)).
