# Writing prompts for image and video models

## The rule that overrides everything
Never describe, generate or restyle the product. The real packshot is composited afterwards. Scenes must contain no bottles, packaging, labels, text, logos or other brands. Ask for a clear, empty, in-focus surface where the product will stand.

## Image models (nano_banana_2.1, gemini_image3.1_flash, gpt_image_2, gen4_image)
- Write one flowing brief in this order: intended use, shot type, setting, foreground surface, background, lighting, camera, palette, constraints.
- Say "photorealistic commercial photograph". Prefer real material texture over a staged, glossy look.
- Always name the lighting direction, softness and colour temperature, the camera angle and the lens. Light must suit the product's matte finish.
- Keep the area where the product will stand empty, roughly centred, with props behind it and lower than the product's shoulder.
- The empty area must be the same continuous surface as everything around it. Never ask for a marked, cleared or framed zone: models draw those as a visible patch, mat or rectangle. Describe it simply as open stone.
- Use shallow depth of field so the background stays calm.
- Be specific: "pitted travertine ledge" beats "nice stone".
- End with constraints: no products, no packaging, no text, no logos, no people unless asked.
- Reference images are named with @tag. gen4_image prompts are limited to 1,000 characters, so stay under 900.

## Video models (seedance2_5, gen4.5, veo3.1)
- The image already shows the scene, so don't re-describe it. Describe motion only: camera move, then subtle environmental motion.
- One scene, one slow camera move. A locked-off camera or slow push-in keeps the label legible.
- Say what stays still: the product does not move or change, and its label stays sharp.
- Use positive phrasing. Keep it under 60 words.

## Voice-over (eleven_v3, eleven_v4), for later
- Use audio tags like [warm] and ellipses for pacing. There are no SSML break tags.
- Spell numbers and units as spoken: "72-hour" as "seventy-two hour", "400 mL" as "four hundred milliliters".
- Only say approved claims.
