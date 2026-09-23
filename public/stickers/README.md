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

`house.png` was replaced with a die-cut version of the user's supplied iconic
House M.D. meme image. The built-in image-generation tool was used to remove
the screenshot background and preserve the portrait as a transparent sticker.
Edit prompt:

> Use the provided image as the exact edit source. Create a finished transparent-background die-cut vinyl sticker asset for the existing game UI. Preserve the subject's identity, frontal composition, serious expression, blue eyes, hair, beard, clothing collar, and photographic appearance exactly; do not stylize, redraw, or change the face. Remove the white screenshot background and the thin line at the bottom, retaining only the portrait silhouette. Add a clean, even off-white sticker border around the portrait silhouette with a very subtle dark edge, matching the existing sticker treatment. Center the portrait in a square canvas with transparent pixels outside the sticker. No text, logos, watermark, extra objects, or background.

An initially generated Speed variant was superseded by the user's supplied image
and is not used by the project.

## Reference revisions

The laryngoscope, IAFF silhouette, Freedom House badge, and Narcan sprayer were
redrawn as SVGs using the user’s September 22 screenshots. EMT and paramedic
patches now use circular embroidery-style badges. LIFEPAK 15 and Zoll X have
distinct housings and control layouts following the user’s specifications.
The eight-ball lettering is fitted inside its inverted triangle.

Paid unlocks require four times their initial XP thresholds. The last sticker
requires 4,800 lifetime XP and 20 completed scenarios; both conditions are
validated for guests and accounts, with the permanent ADMIN bypass preserved.
