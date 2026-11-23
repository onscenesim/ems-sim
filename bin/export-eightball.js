#!/usr/bin/env node
'use strict';

// Bundle the current production widget, rather than maintaining a second copy.
const fs = require('node:fs');
const path = require('node:path');
const { crc32, deflateRawSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/exports/eightball');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('public/index.html');
const css = read('public/style.css');
const app = read('public/app.js');

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Widget source markers changed: ' + start);
  return source.slice(a, b);
}
const icon = html.match(/<button class="magic-8-ball"[\s\S]*?<\/button>/)?.[0];
const dialog = html.match(/<dialog id="eightball-dialog"[\s\S]*?<\/dialog>/)?.[0];
if (!icon || !dialog) throw new Error('Widget markup unavailable.');
const svgData = 'data:image/svg+xml;base64,' + Buffer.from(read('public/eightball.svg')).toString('base64');
const markup = icon + dialog.replace(/src="eightball\.svg[^"]*"/, 'src="' + svgData + '"');
const fontData = fs.readFileSync(path.join(root, 'public/fonts/PixelOperator.ttf')).toString('base64');
const noise = css.match(/--noise:\s*([^;]+);/)?.[1];
if (!noise) throw new Error('Widget texture unavailable.');
const styles = [
  ':host{display:inline-flex;align-items:center;--font-xp:EMS8BallPixel,Arial,sans-serif;--noise:' + noise + ';color-scheme:light}',
  ':host([floating]){position:fixed;right:var(--ems-eightball-right,18px);bottom:var(--ems-eightball-bottom,max(18px,env(safe-area-inset-bottom)));z-index:50}',
  '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}button{font:inherit}',
  between(css, '.magic-8-ball {\n  flex-shrink:', '.company-name'),
  '#eightball:focus-visible{outline:2px solid #315b81;outline-offset:3px}',
  between(css, '@keyframes shake {', '/* ── Mobile'),
  between(css, '.xp-close, #vitals-panel .xp-close {', '.dialog-titlebar'),
].join('\n');
const controller = between(app, 'const EIGHT_BALL =', '// ── Export transcript').replace(/\bPixelOperator\b/g, 'EMS8BallPixel');
const bundle = [
  '/* EMS Terminal magic 8 ball. Self-contained export; no network requests or dependencies. */',
  '(() => { "use strict";',
  'if (customElements.get("ems-eight-ball")) return;',
  'const fontReady = new FontFace("EMS8BallPixel", "url(data:font/ttf;base64,' + fontData + ')", {weight:"400 700"}).load().then(font => { globalThis.document.fonts.add(font); });',
  'class EMSEightBall extends HTMLElement {',
  'constructor(){ super(); this.attachShadow({mode:"open"}); }',
  'connectedCallback(){',
  'if(this._dispose) return;',
  'const root=this.shadowRoot, removers=[];',
  'root.innerHTML=' + JSON.stringify('<style>' + styles + '</style>' + markup) + ';',
  'const document={getElementById:id=>root.getElementById(id),fonts:{ready:fontReady.then(()=>globalThis.document.fonts.ready)}};',
  'const window={get devicePixelRatio(){return globalThis.devicePixelRatio},matchMedia:query=>globalThis.matchMedia(query),addEventListener:(type,fn)=>{globalThis.addEventListener(type,fn);removers.push(()=>globalThis.removeEventListener(type,fn));}};',
  controller,
  'this._shake=shakeEightball; this._close=closeEightball;',
  'this._dispose=()=>{clearEightballTimers();if(eightballDialog.open)eightballDialog.close();removers.forEach(remove=>remove());};',
  '}',
  'open(){this._shake?.();}',
  'close(){this._close?.();}',
  'disconnectedCallback(){this._dispose?.();this._dispose=null;this._shake=null;this._close=null;}',
  '}',
  'customElements.define("ems-eight-ball",EMSEightBall);',
  '})();',
  '',
].join('\n');
const snippet = '<script src="./ems-eightball.js" defer></script>\n<ems-eight-ball floating></ems-eight-ball>';
const readme = [
  'EMS TERMINAL — PORTABLE MAGIC 8 BALL',
  '',
  'FOR YOUR EMS CHECKLIST',
  '1. Copy ems-eightball.js into the checklist project\'s dist folder.',
  '2. In dist/index.html, add the following immediately before </body>, outside #app:',
  '',
  snippet,
  '',
  '3. Deploy the checklist as usual. This package does not publish or change the live checklist.',
  '',
  'The floating icon appears in the bottom-right corner. To place it inside an existing',
  'footer instead, omit the floating attribute and put the element in that footer.',
  'Adjust the floating position using --ems-eightball-bottom and --ems-eightball-right.',
  '',
  'PREVIEW',
  'Double-click ems-eightball-standalone.html. It works offline and contains every asset.',
  'index.html is the export page; keep it beside ems-eightball.js to use its preview.',
  '',
  'FRAMEWORKS',
  'This is a native custom element with isolated styling. Load the script once, then',
  'render <ems-eight-ball floating></ems-eight-ball> in the page or app shell.',
  'Removing the element cleans up its timers, modal, and resize listener.',
  'The element also exposes open() and close() methods for a custom trigger.',
  '',
  'INCLUDED',
  'The current artwork, Pixel Operator font, crisp texture, readable high-density text,',
  'continuous settling animation, tap-to-reroll, outside/Escape dismissal, and timeout.',
  'No simulator code, analytics, email settings, API keys, or external services are required.',
  '',
  'REFRESHING THE EXPORT',
  'In the EMS simulator repository, run: npm run export:eightball',
  'The bundle is generated directly from the current simulator widget.',
  '',
  'FONT LICENSE',
  read('public/fonts/PIXEL_OPERATOR_LICENSE.txt'),
].join('\n');
function page(script, downloads) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Export the magic 8 ball</title><style>' +
    'body{margin:0;min-height:100vh;background:#111c2c;color:#edf0ee;font:17px/1.6 system-ui,sans-serif}main{max-width:720px;margin:auto;padding:56px 24px 100px}h1{font-size:clamp(28px,5vw,42px);line-height:1.15}p{color:#bccad5}nav{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0}a{color:#c5d9eb}nav a,button{padding:12px 16px;background:#d7c29b;color:#28251f;text-decoration:none;border:2px solid;border-color:#fff0ce #746044 #746044 #fff0ce;font:inherit;cursor:pointer}pre{padding:18px;background:#09121d;border:1px solid #35485c;white-space:pre-wrap;overflow-wrap:anywhere;color:#d5e7f1}aside{padding:18px;background:#1c2c3e;border-left:3px solid #b6a682}#copy-status{min-height:1.6em}button:focus-visible,a:focus-visible{outline:2px solid #f8e0a5;outline-offset:4px}' +
    '</style></head><body><main><p>EMS TERMINAL · PORTABLE WIDGET</p><h1>Take the magic 8 ball with you.</h1><p>Tap the little ball in the bottom-right corner to try the complete animation. Its artwork, font, and behavior are included.</p>' +
    (downloads ? '<nav><a href="ems-eightball-widget.zip" download>Download widget ZIP</a><a href="ems-eightball-standalone.html" download>Download offline preview</a><a href="ems-eightball.js" download>Download widget file</a></nav>' : '') +
    '<aside><strong>For your EMS checklist</strong><p>Copy <code>ems-eightball.js</code> into its <code>dist</code> folder, then add these two lines before <code>&lt;/body&gt;</code> in <code>dist/index.html</code>.</p></aside><pre id="snippet">' +
    snippet.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') +
    '</pre><button id="copy" type="button">Copy the two lines</button><p id="copy-status" role="status"></p><p>Works with plain HTML and web apps. The widget keeps its styling separate from your checklist.</p></main><ems-eight-ball floating></ems-eight-ball>' +
    script + '<script>document.getElementById("copy").addEventListener("click",async()=>{const text=document.getElementById("snippet").textContent;try{await navigator.clipboard.writeText(text);document.getElementById("copy-status").textContent="Copied."; }catch{const range=document.createRange();range.selectNodeContents(document.getElementById("snippet"));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.getElementById("copy-status").textContent="The two lines are selected. Copy them to continue.";}});</script></body></html>';
}

// A small standards-compliant ZIP writer keeps the export independent of OS tools.
function zip(files) {
  const locals=[], central=[]; let offset=0;
  for (const [name, value] of Object.entries(files)) {
    const filename=Buffer.from(name), data=Buffer.from(value), compressed=deflateRawSync(data);
    const checksum=crc32(data), local=Buffer.alloc(30), entry=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(0x800,6);
    local.writeUInt16LE(8,8); local.writeUInt16LE(0x5c21,12); local.writeUInt32LE(checksum,14);
    local.writeUInt32LE(compressed.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6);
    entry.writeUInt16LE(0x800,8); entry.writeUInt16LE(8,10); entry.writeUInt16LE(0x5c21,14);
    entry.writeUInt32LE(checksum,16); entry.writeUInt32LE(compressed.length,20); entry.writeUInt32LE(data.length,24);
    entry.writeUInt16LE(filename.length,28); entry.writeUInt32LE(offset,42);
    locals.push(local,filename,compressed); central.push(entry,filename);
    offset+=local.length+filename.length+compressed.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22), count=Object.keys(files).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count,8); end.writeUInt16LE(count,10);
  end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

function build() {
  const files = {
    'ems-eightball.js': bundle,
    'index.html': page('<script src="ems-eightball.js"></script>', true),
    'ems-eightball-standalone.html': page('<script>' + bundle.replaceAll('</script', '<\\/script') + '</script>', false),
    'README.txt': readme,
    'add-to-checklist.html': snippet + '\n',
    'PIXEL_OPERATOR_LICENSE.txt': read('public/fonts/PIXEL_OPERATOR_LICENSE.txt'),
  };
  fs.mkdirSync(output, {recursive:true});
  for (const [name,value] of Object.entries(files)) fs.writeFileSync(path.join(output,name),value);
  fs.writeFileSync(path.join(output,'ems-eightball-widget.zip'),zip(files));
  return { output, files };
}
if (require.main === module) {
  build();
  console.log('Portable widget: ' + path.join(output,'ems-eightball-widget.zip'));
}
module.exports = { build, zip };
