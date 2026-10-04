# Knightfall social preview artwork

Final asset: [`public/knightfall-social-preview.jpg`](../public/knightfall-social-preview.jpg).
Generated with the built-in image generation tool, then resized with preserved
aspect ratio and encoded as a 1200 × 630 JPEG at quality 90.
The central knight keeps the subject visible when a sharing app crops the image.
The artwork includes a large gold "Knightfall" title with "Chess dungeon crawler"
beneath it. Matching titles are also supplied by HTML metadata.

Metadata lives in `index.html`. Vite replaces `__SITE_URL__` with an absolute public
URL in both development and production HTML. The Pages workflow sets
`VITE_SITE_URL` to its configured base URL; the fallback is
`https://rhenness.github.io/chess-roguelite/`. The asset is copied into `dist`
by Vite and becomes available when the site is deployed.

Implementation references: [Apple's Messages preview guidance](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages)
and the [Open Graph protocol](https://ogp.me/).

## Original generation prompt

```text
Use case: stylized-concept
Asset type: social link preview artwork for Knightfall, a chess roguelite dungeon crawler.
Primary request: create a polished original landscape illustration of a chess knight exploring a dungeon, immediately recognizable and appealing at small iMessage link-preview sizes.
Scene/backdrop: a mysterious medieval stone dungeon with vaulted arches and warm gold torchlight, deep forest-green shadows, and a worn ivory-and-green checkerboard floor receding into the dungeon.
Subject: a single large sculpted ivory horse-head chess knight on its chess-piece pedestal, with tasteful gold details, placed prominently near the center; distant shadowy rook-shaped dungeon pillars.
Style/medium: premium stylized 3D fantasy game key art, tactile carved stone, restrained cinematic atmosphere and beautiful soft volumetric light, crisp silhouette.
Composition/framing: wide landscape approximately 1.91:1 (1200x630 target), centered subject and all important details within the central 70 percent so cropped previews still work; uncluttered background and strong readable contrast.
Lighting/mood: adventurous, inviting, mysterious; ivory knight illuminated by warm gold torchlight against forest-green dungeon.
Color palette: deep green #142b25, forest green #234b40, ivory #e9e3d4, antique gold #dfbc77.
Constraints: image only, no words, no lettering, no logo, no watermark, no UI; no human knight, no extra horse heads; opaque background.
```

## Title edit prompt

Applied to the original social preview JPEG with the built-in image generation tool.

```text
Use case: precise-object-edit
Asset type: Knightfall social sharing / iMessage preview image.
Edit target: the supplied Knightfall artwork of an ivory chess knight in a green and gold torchlit dungeon.
Primary request: add attractive, professionally designed game-title typography onto this image. Exact title text: "Knightfall". Exact subtitle text: "Chess dungeon crawler".
Typography and composition: create a centered two-line title lockup in the lower quarter of the image: a large, bold, beautifully crafted ivory-and-antique-gold fantasy serif title "Knightfall", with a smaller but still very readable clean ivory subtitle "Chess dungeon crawler" beneath it. Use generous spacing and subtle shadow or a soft dark-green gradient behind the text so it is legible at small social-preview sizes. The title should be large enough to read clearly, approximately half the image width. Keep both lines fully within the image, away from the outer edges. Text can overlap the floor but should not cover the horse head. Render those two strings exactly with accurate spelling.
Invariants: preserve the existing knight, its face and pedestal, the dungeon architecture, torches, checkerboard floor, green-and-gold palette, cinematic lighting and wide 1.91:1 landscape composition. Change only the typography and subtle floor-area contrast required for readability. No extra words, no watermark, no UI; opaque background.
Output: polished finished game cover art for a 1200x630 social preview.
```
