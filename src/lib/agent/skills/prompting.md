# Writing prompts for image and video models

## The rule that overrides everything
Never describe, generate or restyle the product. The real packshot is composited afterwards. Scenes must contain no bottles, packaging, labels, text, logos or other brands. Ask for a clear, empty, in-focus surface where the product will stand.

Follow the In-use section below when the shot brief says it's an in-use scene. It overrides the image rules wherever they differ.

## Image models (nano_banana_2.1, gemini_image3.1_flash, gpt_image_2, gen4_image)
- Write one flowing brief in this order: intended use, shot type, setting, foreground surface, background, lighting, camera, palette, constraints.
- Say "photorealistic commercial photograph". Prefer real material texture over a staged, glossy look.
- Always name the lighting direction, softness and colour temperature, the camera angle and the lens. Light must suit the product's matte finish.
- Keep the area where the product will stand empty, roughly centred, with props behind it and lower than the product's shoulder.
- The empty area must be the same continuous surface as everything around it. Never ask for a marked, cleared or framed zone: models draw those as a visible patch, mat or rectangle. Describe it simply as open stone.
- Use shallow depth of field so the background stays calm.
- Be specific: "pitted travertine ledge" beats "nice stone".
- End with constraints: no products, no packaging, no text, no logos, no people.
- Reference images are named with @tag. gen4_image prompts are limited to 1,000 characters, so stay under 900.

## In-use scenes
Show the product being used. Show the action happening, not a texture left behind after it. A dollop on a ledge isn't use, because nobody applies hair care to a shelf.

**Choose the moment from the product.** Use its directions and category. These are the moments for each kind of product, and for anything else, work out a moment from its directions:

| Product | Moment | How the product behaves |
|---|---|---|
| Shampoo | Wet hands working lather through wet hair | Soft white lather with fine bubbles |
| Conditioner | Fingers combing through the wet lengths of the hair | A smooth white cream. It never foams |
| Hair mask | Fingertips smoothing thick cream onto damp hair, with a white towel on the shoulders | A rich, dense cream. It never foams |
| Scalp treatment or serum | Fingertips massaging a parted section of scalp | A few clear drops that sit on the skin. It never foams |
| Travel set | No hair. A hand packing a folded white towel into an open, empty linen toiletry bag on a hotel bathroom counter | No product visible |

**Keep the real pack separate.** It stands in the foreground after the scene is made, and it can't be held or overlapped.
- Hands, hair and everything they're doing stay in the right two thirds of the frame, in the mid-ground.
- The left third is open surface in the foreground, in sharp focus: the same continuous material as the rest, with nothing crossing it.
- Never ask for a hand holding, squeezing, reaching for or pouring from anything. Product is already on the fingers or in the hair.

**People.**
- Show hands, forearms, and hair from behind or the side. Never a face. Ask for natural skin texture and relaxed, natural fingers.
- No jewellery, painted nails or tattoos.

**Setting.** Make it visibly different from Lifestyle, in the same palette and warm window light from the left.
- Use a wet shower ledge, wet matte beige tile and soft steam. The hair mask and scalp treatment can use a bright bathroom instead. The travel set uses a hotel bathroom counter.
- Water beads on the stone are welcome. The aloe plant and stacked towels belong to Lifestyle, so leave them out.
- Suggested settings and props from the product analysis don't apply here.

**Camera and constraints.**
- Camera at ledge height, straight on, about 50mm at f/2.8, so the foreground stays sharp and the hands read clearly.
- End with: no bottles, tubes, jars, droppers, packaging, labels, text, logos, faces or jewellery.

## Video models (seedance2_5, gen4.5, veo3.1)
- The image already shows the scene, so don't re-describe it. Describe motion only: camera move, then subtle environmental motion.
- One scene, one slow camera move. A locked-off camera or slow push-in keeps the label legible.
- Say what stays still: the product does not move or change, and its label stays sharp.
- Use positive phrasing. Keep it under 60 words.

## Voice-over (eleven_v3, eleven_v4), for later
- Use audio tags like [warm] and ellipses for pacing. There are no SSML break tags.
- Spell numbers and units as spoken: "72-hour" as "seventy-two hour", "400 mL" as "four hundred milliliters".
- Only say approved claims.
