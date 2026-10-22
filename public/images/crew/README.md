# EMS crew portraits

All 21 stock crew identities have 512 × 512 WebP portraits, displayed at up
to 240 CSS pixels in the production crew reference cards. Custom crew keep
their own descriptions and do not borrow a stock person's appearance.

The initial references are the selected portraits from
`Cyberpunk-Branch/public/images/crew`, as identified by that project's
`crew-portraits.js`: `-v2`, except Priya `-v5`, Darnell `-v13`, Fatima `-v6`,
Sandra `-v15`, and Yolanda `-v4`. Earlier source revisions were not imported
or modified. The initial source revision remains in each adaptation's filename.

Sandra's selected EMS revision is now `sandra-okonkwo-v16-ems.webp`, adapted
from the user's 2026-10-21 reference with its softer smile, curly gray hair,
direct gaze and reaching hand. It retains the blue/orange painted background,
with a white captain's shirt and simple gold sleeve patch. Her earlier
`-v15-ems.webp` portrait remains available for comparison.

The built-in imagegen tool adapts the uniforms while preserving each
person's identity, expression, pose, background and loose painted character.
Partners wear navy collared EMS shirts; captains wear white collared shirts.
Paramedics have gold medical patches; EMTs have white medical patches,
including EMT captains Ruth Callahan and Gord Beaulieu.

Patches are small, flat cloth shapes on an outer upper sleeve below its
shoulder seam. A muted backing and three broad gold or white paint marks
suggest a medical asterisk, following the sleeve's angle and folds. Keep the
same abbreviated broken brushwork as the surrounding shirt. Cropped or
partly hidden patches are natural. Avoid borders, stitching, detailed snakes
or rods, bare chest emblems, floating logos, crisp vector symbols, armor and
Trauma Team branding. `prompts.json` records the uniform and patch edit prompts.

Run `node test/preview-crew-portraits.js` and open
<http://127.0.0.1:3052/> for the production cards with a roster selector,
custom crew example, complete shift, light mode and 390px mobile preview.
This preview does not start model calls or write player saves.
