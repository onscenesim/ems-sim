EMS TERMINAL — PORTABLE MAGIC 8 BALL

FOR YOUR EMS CHECKLIST
1. Copy ems-eightball.js into the checklist project's dist folder.
2. In dist/index.html, add the following immediately before </body>, outside #app:

<script src="./ems-eightball.js" defer></script>
<ems-eight-ball floating></ems-eight-ball>

3. Deploy the checklist as usual. This package does not publish or change the live checklist.

The floating icon appears in the bottom-right corner. To place it inside an existing
footer instead, omit the floating attribute and put the element in that footer.
Adjust the floating position using --ems-eightball-bottom and --ems-eightball-right.

PREVIEW
Double-click ems-eightball-standalone.html. It works offline and contains every asset.
index.html is the export page; keep it beside ems-eightball.js to use its preview.

FRAMEWORKS
This is a native custom element with isolated styling. Load the script once, then
render <ems-eight-ball floating></ems-eight-ball> in the page or app shell.
Removing the element cleans up its timers, modal, and resize listener.
The element also exposes open() and close() methods for a custom trigger.

INCLUDED
The current artwork, Pixel Operator font, crisp texture, readable high-density text,
continuous settling animation, tap-to-reroll, outside/Escape dismissal, and timeout.
No simulator code, analytics, email settings, API keys, or external services are required.

REFRESHING THE EXPORT
In the EMS simulator repository, run: npm run export:eightball
The bundle is generated directly from the current simulator widget.

FONT LICENSE
Pixel Operator
Copyright 2009-2018 Jayvee Enaguas (HarvettFox96)

This font is licensed under Creative Commons Zero 1.0 Universal (CC0 1.0).
https://creativecommons.org/publicdomain/zero/1.0/

The bundled font metadata identifies this release as PixelOperator,
FontForge 2018.10.04-1.
