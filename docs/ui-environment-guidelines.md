# UI environment guidelines

Use these guidelines when creating environments for Run, Endless, and Daily Dungeon. Match the app's existing isometric art style and main menu. Preserve existing controller, keyboard, and move-selection behavior when changing presentation.

- **Keep the board central.** Arrange scenery around it so pieces, move arrows, coordinates, and the playable position remain easy to read.
- **Use a coherent material palette.** Carry the terrain's colors through the stand, pillars, button platforms, and HUD. Tint light board squares toward the stand material while preserving clear square and piece contrast. The default Run and Endless environment should fit the app's green theme and main menu.
- **Theme the whole frame.** Match navbar icon backdrops, plaques, item panels, and other surrounding surfaces to the environment. Preserve recognizable icon and move-option colors; recolor materials without applying a color filter to the entire interface.
- **Maintain consistent isometric geometry.** Match projection angles, cap thickness, lighting direction, and face shading across objects.
- **Give the stand a square surface.** Align it with the board using shared bounds and uniform scaling. Draw its depth separately below that surface.
- **Make visible padding equal.** Measure the gap between the playable grid and the rim on all four sides. Use a modest inset, rounded board corners, and a surface color that lets the board sit naturally within the stand.
- **Treat depth as deliberate layering.** Rear pillar shafts sit behind the deck, their caps project above the rim, and front supports extend visibly below it. Keep floor progress marks above the stand so supports cannot obscure them.
- **Use substantial corner supports.** Broad caps, bevels, and stacked stone facets make the stand feel grounded. Match their geometry and materials to the deck.
- **Add restrained edge detail.** Moss, lichen, cracks, snow, or similar accents can slightly overlap the perimeter while keeping pieces and coordinates clear.
- **Integrate controls into the terrain.** Use square colored SVG panels with thick inset borders, seated on broad platforms made from the environment's materials. Keep selection and confirmation states clear.
- **Keep the HUD quiet.** Prefer simple lines, checkpoint dots, recognizable icons, and minimal text. Avoid decorative diamonds, unnecessary endpoint pieces, and extra controls that add noise. Aim for intuitive UI without explanation text.
- **Anchor scenery to the central composition.** Position and scale scenery relative to the board and shared scene coordinates. Do not attach decorative islands to viewport edges or enlarge them as the window widens.
- **Compose scenery in depth layers.** Nearby scenery frames the board; two background layers extend the scene outward. Background forms should become smaller, softer, and more faded with distance. Keep decorative density lower around interactive elements.
- **Simplify distant forms.** Reduce vegetation, architectural detail, cracks, and surface accents as objects recede. Use quiet silhouettes in the farthest layer instead of miniature copies of detailed foreground islands.
- **Arrange scenery naturally.** Vary heights, offsets, island sizes, clusters, and open pockets. Avoid rows, mirrored arrangements, evenly spaced objects, and placements that read as a grid.
- **Vary silhouettes and landmarks.** Mix shelves, crags, ridges, cliff heights, and vegetation groupings. Use waterfalls, banners, stairs, arches, and other landmarks sparingly rather than repeating the same object on every island.
- **Fade outward from the main content.** Keep nearby background layers at a consistent distance, scale, and fade relative to the board. Allow empty space at the edges of wide screens instead of stretching scenery to fill every pixel.
- **Design responsively from the start.** Support phones through 1920 × 1080, including landscape layouts, supplies, and active effects. Keep the board, stand, floor counter, and controls visible, with comfortable control sizes as the board scales.
- **Animate ambient details subtly.** Use slow drift for selected nearby islands, flowing water, flickering flames, gentle light pulses, and occasional drifting motes. Keep distant scenery static and the board steady. Honor reduced-motion settings for every ambient animation.
- **Build reusable SVG components.** Share geometry, layering, material variables, and positioning rules across terrains. Vary materials, vegetation, weather, architecture, and landmark placement to give each environment its own identity while retaining the same art style.
- **Validate visually and geometrically.** Check equal margins, rear-pillar occlusion, visible caps and front supports, floor-counter depth, clipping, control reachability, and scene coverage across representative screen sizes. Verify consistent layer scale, static distant scenery, readable board contrast, and reduced-motion behavior.
