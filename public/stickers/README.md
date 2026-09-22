# EMS cosmetic artwork

The application loads the local files in this directory. The shared catalog in
`../cosmetics-catalog.js` supplies names and XP thresholds. Equipping cosmetics
uses lifetime XP without spending it; the provisioned ADMIN player has a permanent
unlock-all role, including future catalog entries. Guests keep their choices in
local storage and player accounts keep theirs in the durable player store.
The two sticker positions are on the Field Notes paper beside the written vitals;
pen colors are selected beside the scratch pad’s Clear button.

## Sources

- `speed.jpg`: the user's supplied **IMG_1245.jpeg**, copied unchanged. The sticker
  border and presentation crop are CSS; the provided meme expression is retained.
- `davita.jpg`: the actual [DaVita newsroom logo](https://newsroom.davita.com/logos/),
  downloaded from its public image link:
  https://newsroom.davita.com/wp-content/uploads/sites/2/2025/10/DaVita_Logo_RGB_F_300dpi-thumb_f1ba33.jpg
- `freedom-house.svg`: original vector memorial artwork referencing the blue/gold
  badge and red caduceus/lightning motif in the
  [Heinz History Center collection](https://heinzhistorycenter.emuseum.com/objects/51654/sticker).
  Dates 1967–1975 confirmed by the user after checking the
  [University of Pittsburgh archive](https://dec.hsls.pitt.edu/s/FreedomHouse/page/intro).
- Other SVGs: original vector sticker illustrations, generated reproducibly with
  `node bin/build-sticker-art.js`. The custom Post-it is rendered from text nodes
  at runtime, so messages cannot inject SVG/HTML.

## House image generation

`house.png` was created with the built-in image-generation tool (not the CLI).
The generated original was copied into this directory, preserving transparency.
Final prompt:

> Create one finished die-cut vinyl sticker asset for a retro EMS simulation game. Subject: an instantly recognizable comically zoomed-in portrait of Dr. Gregory House (Hugh Laurie) from House M.D., piercing blue eyes, furrowed brows, scruffy stubble, slightly crooked sardonic grin; exaggerated extreme close-up with the forehead and chin cropped by the die-cut silhouette. Style: high-quality photographic meme cutout with slightly posterized colors, not generic cartoon. Face fills nearly the entire sticker; thick off-white die-cut sticker edge. Single isolated sticker centered, transparent background, no text, no additional objects, no shadow beyond the sticker. Square composition, usable small at 100px.

An initially generated Speed variant was superseded by the user's supplied image
and is not used by the project.

## Reference revisions

The laryngoscope, IAFF silhouette, Freedom House badge, and Narcan sprayer were
redrawn as SVGs using the user’s September 22 screenshots. EMT and paramedic
patches now use circular embroidery-style badges. LIFEPAK 15 and Zoll X have
distinct housings and control layouts following the user’s specifications.
The eight-ball lettering is fitted inside its inverted triangle.
