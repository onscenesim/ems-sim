'use strict';
// Focused UI fixture: no accounts, saved progress, or model calls.
const express = require('express');
const path = require('node:path');
const app = express();
app.get('/', (_req, res) => res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pen motion preview</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/cosmetics.css"><style>html,body{height:auto;overflow:auto;background:#cecebc;color:#273740}#cosmetics-dialog{position:static;display:block;margin:12px auto;padding:12px;width:min(740px,100%);max-height:none;background:none;border:0;box-shadow:none;overflow:visible}section{border-bottom:1px solid #aaa;padding-bottom:12px}h1{font:20px var(--font-xp)}label{font:16px var(--font-xp)}</style><main id="cosmetics-dialog"><h1>Pen motion preview</h1><label><input id="sound" type="checkbox"> Pen sounds</label><div id="pens"></div></main><script src="/pen-kit.js"></script><script>for(const id of ['green','orange','pink','black','red','teal','purple','navy']){const host=document.createElement('section');document.getElementById('pens').append(host);PenKit.mount(host,id,{soundEnabled:()=>document.getElementById('sound').checked});}</script></html>`));
app.use(express.static(path.join(__dirname, '../public')));
app.listen(3012, '127.0.0.1', () => console.log('Pen motion preview: http://127.0.0.1:3012'));
