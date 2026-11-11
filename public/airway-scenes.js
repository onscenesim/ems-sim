'use strict';
// Keep the reviewed anatomy, and reuse the original device SVGs and animation
// sequences in a calibrated coordinate frame. The i-gel cuff is fitted to the
// laryngeal entrance, with its tapered end following the esophageal axis.
(() => {
  const ns='http://www.w3.org/2000/svg';
  const source=document.getElementById('laryngoscope-svg');if(!source)return;
  const mapFor=(fromA,toA,fromB,toB)=>{
    const ax=fromB[0]-fromA[0],ay=fromB[1]-fromA[1],bx=toB[0]-toA[0],by=toB[1]-toA[1];
    const denom=ax*ax+ay*ay,a=(ax*bx+ay*by)/denom,b=(ax*by-ay*bx)/denom;
    return `matrix(${a} ${b} ${-b} ${a} ${toA[0]-a*fromA[0]+b*fromA[1]} ${toA[1]-b*fromA[0]-a*fromA[1]})`;
  };
  const maps={
    sga:mapFor([156,120],[155,188],[216,198],[285,305]),
    opa:mapFor([157,111],[154,181],[194,173],[234,276]),
    npa:mapFor([137,121],[102,221],[200,184],[215,289]),
    suction:'matrix(2 0 0 2 -154 -52)'
  };
  const referenceCoordinates=(scene)=>{
    const m=maps[scene].match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number),[a,b,c,d,e,f]=m,det=a*d-b*c;
    const point=(x,y)=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det];
    return {scale:Math.hypot(a,b),point,anatomyPath:(value)=>{
      const tokens=value.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g),out=[];
      while(tokens.length){if(/^[A-Z]$/.test(tokens[0]))out.push(tokens.shift());else{const x=+tokens.shift(),y=+tokens.shift();out.push(a*x+c*y+e,b*x+d*y+f);}}
      return out.join(' ');
    },path:(value)=>{
      const tokens=value.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g),out=[];
      while(tokens.length){if(/^[A-Z]$/.test(tokens[0]))out.push(tokens.shift());else out.push(...point(+tokens.shift(),+tokens.shift()).map(v=>v.toFixed(4)));}
      return out.join(' ');
    }};
  };
  const trachealAirflow='M282 279 C322 277 347 294 380 322 C424 354 467 391 508 406';
  for(const scene of ['sga','opa','npa','suction','obstruction']){
    const overlay=document.getElementById(scene+'-overlay'),old=document.getElementById(scene+'-svg');if(!overlay||!old)continue;
    const original=old.querySelector('.airway-scene');
    const deviceParts=[...original.children].filter(el=>!new RegExp('^'+scene+'-(head|body|tongue|epiglottis|trachea|esophagus|cords|labels)$').test(el.id));
    const svg=source.cloneNode(true);
    for(const id of ['lx-mac','lx-light','lx-tube-assembly','lx-success-ring','lx-success-rays','lx-tongue','lx-epiglottis','lx-laryngeal-floor','lx-neck-detail'])svg.querySelector(`[id="${id}"]`)?.remove();
    svg.querySelectorAll('.lx-original-cords,.lx-lower-teeth').forEach(el=>el.remove());
    const ids=new Map();
    [svg,...svg.querySelectorAll('[id]')].forEach(el=>{const id=el.id;if(!id)return;const next=el===svg?scene+'-svg':scene+'-'+id;ids.set(id,next);el.dataset.airwayPart=id;el.id=next;});
    svg.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(attr=>{let value=attr.value;for(const[from,to]of ids){if(value==='#'+from)value='#'+to;value=value.replaceAll('url(#'+from+')','url(#'+to+')');}if(value!==attr.value)el.setAttribute(attr.name,value);});});
    const root=svg.querySelector('.lx-scene');root.classList.replace('lx-scene','ra-scene');
    const anatomy=document.createElementNS(ns,'g');anatomy.classList.add('ra-anatomy');while(root.firstChild)anatomy.append(root.firstChild);root.append(anatomy);
    const gear=document.createElementNS(ns,'g');gear.classList.add('reference-device-frame');if(maps[scene])gear.setAttribute('transform',maps[scene]);
    for(const part of deviceParts){
      if(part.classList.contains('airway-phases')){part.querySelectorAll('text').forEach(text=>{text.setAttribute('x','280');text.setAttribute('y','550');});root.append(part);}
      else gear.append(part);
    }
    root.append(gear);
    // The proximal flow shares the exact device centerline and transformation.
    // Its continuation starts at the airway outlet and stays in the new lumen.
    const flow=gear.querySelector('#'+scene+'-flow');
    if(scene==='sga'||scene==='opa'){
      const ref=referenceCoordinates(scene),device=gear.querySelector('#'+scene+'-device');
      if(scene==='sga'){
        // One closed plastic body and one continuous lumen eliminate the old
        // shaft/cuff seam. The rigid mask has an open bowl and an anterior seal.
        const IGEL_MODEL={"cuff":[[238.486,268.382],[254.469,272.976],[292,307],[309,317]],"radii":[[0,12.5],[0.2,16.5],[0.55,13.5],[0.85,8.5],[1,3.8]],"backControl":[273,327],"backTip":[311,327],"backReach":20,"tipRadius":3.8};
        const bezier=(c,t)=>{const u=1-t;return [0,1].map(k=>u*u*u*c[0][k]+3*u*u*t*c[1][k]+3*u*t*t*c[2][k]+t*t*t*c[3][k]);};
        const tangent=(c,t)=>{const u=1-t;return [0,1].map(k=>3*(u*u*(c[1][k]-c[0][k])+2*u*t*(c[2][k]-c[1][k])+t*t*(c[3][k]-c[2][k])));};
        const radius=(t,knots=IGEL_MODEL.radii)=>{for(let i=1;i<knots.length;i++){const a=knots[i-1],b=knots[i];if(t<=b[0]){let u=(t-a[0])/(b[0]-a[0]);u=u*u*(3-2*u);return a[1]+(b[1]-a[1])*u;}}return .9;};
        const globalStem=ref.anatomyPath('M153 86 C151 134 162 157 194 173'),values=globalStem.match(/-?\d+(?:\.\d+)?/g).map(Number),shaft=[];
        for(let i=0;i<values.length;i+=2)shaft.push(values.slice(i,i+2));
        IGEL_MODEL.cuff[0]=shaft[3];IGEL_MODEL.cuff[1]=shaft[3].map((v,k)=>v+(v-shaft[2][k])*.26);
        const unit=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);},normal=v=>[v[1],-v[0]];
        const neck=shaft[3],neckDirection=unit(tangent(shaft,1)),neckNormal=normal(neckDirection),tipPoint=IGEL_MODEL.cuff[3],tipDirection=unit(tangent(IGEL_MODEL.cuff,1)),tipNormal=normal(tipDirection);
        const backCurve=[neck.map((v,k)=>v-neckNormal[k]*12.5),null,IGEL_MODEL.backControl,IGEL_MODEL.backTip];backCurve[1]=backCurve[0].map((v,k)=>v+neckDirection[k]*IGEL_MODEL.backReach);
        const front=[],back=[],bulbFront=[],bulbBack=[],sealOuter=[],sealInner=[];
        for(let i=0;i<=120;i++){const t=i/120,p=bezier(shaft,t),n=normal(unit(tangent(shaft,t)));front.push(p.map((v,k)=>v+n[k]*12.5));back.push(p.map((v,k)=>v-n[k]*12.5));}
        for(let i=0;i<=100;i++){const t=i/100,r=radius(t),p=bezier(IGEL_MODEL.cuff,t),n=normal(unit(tangent(IGEL_MODEL.cuff,t))),f=p.map((v,k)=>v+n[k]*r),b=bezier(backCurve,t);bulbFront.push(f);bulbBack.push(b);if(i){front.push(f);back.push(b);}if(t>=.05){sealOuter.push(f);sealInner.push(p.map((v,k)=>v+n[k]*Math.max(0,r-(8*(1-t)+2))));}}
        const polygon=points=>'M'+points.map(p=>p.map(v=>v.toFixed(4)).join(' ')).join(' L')+' Z';
        const frontTip=bulbFront.at(-1),backTip=bulbBack.at(-1),backExit=unit(backCurve[2].map((v,k)=>v-backTip[k])),nose=[frontTip,frontTip.map((v,k)=>v+tipDirection[k]*5),backTip.map((v,k)=>v-backExit[k]*3),backTip],cap=[];
        for(let i=1;i<16;i++)cap.push(bezier(nose,i/16));
        const bulbPolygon=polygon([...bulbFront,...cap,...[...bulbBack].reverse()]);
        const stem=gear.querySelector('#sga-stem');stem.setAttribute('d',ref.path(polygon([...front,...cap,...back.reverse()])));stem.setAttribute('fill','var(--igel-spine)');stem.setAttribute('stroke','var(--igel-edge)');stem.setAttribute('stroke-width','.4');
        const cuff=gear.querySelector('#sga-cuff'),oldPaths=cuff.querySelectorAll('path');oldPaths[0].remove();const seal=oldPaths[1];seal.id='sga-seal';seal.setAttribute('d',ref.path(polygon([...sealOuter,...sealInner.reverse()])));seal.setAttribute('fill','#469d80');seal.setAttribute('fill-opacity','1');seal.setAttribute('stroke','#a3c7b5');seal.setAttribute('stroke-width','.3');seal.setAttribute('opacity','1');
        const bulb=document.createElementNS(ns,'path');bulb.id='sga-bulb';bulb.setAttribute('d',ref.path(bulbPolygon));bulb.setAttribute('fill','var(--igel-lumen)');bulb.setAttribute('stroke','none');cuff.prepend(bulb);
        const rim=document.createElementNS(ns,'path');rim.id='sga-bulb-outline';rim.setAttribute('d',ref.path('M'+backCurve[0].join(' ')+' C'+backCurve.slice(1).flat().join(' ')+' C'+[nose[2],nose[1],nose[0]].flat().join(' ')));rim.setAttribute('fill','none');rim.setAttribute('stroke','var(--igel-spine)');rim.setAttribute('stroke-width',1.2/ref.scale);rim.setAttribute('stroke-linecap','round');seal.before(rim);
        const sealBorder=document.createElementNS(ns,'path');sealBorder.id='sga-seal-border';sealBorder.setAttribute('d',seal.getAttribute('d'));sealBorder.setAttribute('fill','none');seal.after(sealBorder);
        const lumen=gear.querySelector('#sga-lumen');lumen.setAttribute('d',ref.path(globalStem+' C252.5 272.4 269 279.65 282 279'));lumen.setAttribute('stroke','var(--igel-lumen)');lumen.setAttribute('stroke-width',21/ref.scale);lumen.setAttribute('stroke-linecap','butt');lumen.after(cuff);
        // This clip is static in the rigid mask frame. The proximal half-plane
        // leaves the flexible shaft free; no animated SVG instance can drift.
        const shellClip=document.createElementNS(ns,'clipPath');shellClip.id='sga-shell-clip';
        const shell=document.createElementNS(ns,'path');shell.setAttribute('d',ref.path(bulbPolygon));shellClip.append(shell);
        const edgeClip=document.createElementNS(ns,'clipPath');edgeClip.id='sga-cuff-edge-clip';const edgeShell=shell.cloneNode();edgeClip.append(edgeShell);svg.querySelector('defs').append(edgeClip);
        const proximal=document.createElementNS(ns,'path');proximal.setAttribute('d',ref.path(polygon([[1000,0],[-1000,0],[-1000,-2000],[1000,-2000]].map(([a,b])=>neck.map((v,k)=>v+neckNormal[k]*a+neckDirection[k]*b)))));shellClip.append(proximal);svg.querySelector('defs').append(shellClip);lumen.setAttribute('clip-path','url(#sga-shell-clip)');
        const grip=document.createElementNS(ns,'g');grip.id='sga-proximal';device.append(grip);grip.append(gear.querySelector('#sga-connector'),gear.querySelector('#sga-grip'));
        const gastric=document.createElementNS(ns,'path');gastric.id='sga-gastric-channel';gastric.setAttribute('d',lumen.getAttribute('d'));gastric.setAttribute('fill','none');gastric.setAttribute('stroke','#b9ced2');gastric.setAttribute('stroke-width',1/ref.scale);gastric.setAttribute('stroke-linecap','butt');gastric.setAttribute('opacity','.42');gastric.setAttribute('clip-path','url(#sga-shell-clip)');device.insertBefore(gastric,grip);
        const tip=ref.point(309,317);cuff.querySelector('#sga-tip').setAttribute('cx',tip[0]);cuff.querySelector('#sga-tip').setAttribute('cy',tip[1]);cuff.querySelector('#sga-tip').setAttribute('r','.45');cuff.querySelector('#sga-tip').setAttribute('fill','#72b39c');
        flow.setAttribute('d',lumen.getAttribute('d'));
      }else{
        flow.setAttribute('d',device.querySelector('path').getAttribute('d'));
      }
      flow.setAttribute('stroke-width',2.4/ref.scale);flow.setAttribute('stroke-dasharray',[5/ref.scale,7/ref.scale].join(' '));
      device.append(flow);
      const passage=document.createElementNS(ns,'path');passage.classList.add('reference-airway-flow');
      passage.setAttribute('d',ref.anatomyPath(flow.getAttribute('d'))+(scene==='opa'?' C249 278.4 262 280 282 279':'')+' '+trachealAirflow.replace(/^M282 279 /,''));
      passage.setAttribute('fill','none');passage.setAttribute('stroke','#8ee8c0');passage.setAttribute('stroke-width','2.4');passage.setAttribute('stroke-dasharray','5 7');root.append(passage);
      if(scene==='sga'){
        // The sealing face is in front of the internal airway channel in this
        // lateral view. Hide the internal flow where it passes behind the gel.
        const mask=document.createElementNS(ns,'mask');mask.id='sga-seal-flow-mask';mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width','600');mask.setAttribute('height','560');
        const field=document.createElementNS(ns,'rect');field.setAttribute('width','600');field.setAttribute('height','560');field.setAttribute('fill','white');
        const face=document.createElementNS(ns,'path');face.setAttribute('d',ref.anatomyPath(gear.querySelector('#sga-seal').getAttribute('d')));face.setAttribute('fill','black');face.setAttribute('stroke','black');face.setAttribute('stroke-width','1');mask.append(field,face);svg.querySelector('defs').append(mask);passage.setAttribute('mask','url(#sga-seal-flow-mask)');
      }
    }
    if(scene==='suction'){
      const soft=document.createElementNS(ns,'g');soft.id='infant-soft-suction';
      const ready='M152 71 C126 53 103 69 114 92 C120 107 134 102 145 110';
      // The hose sleeve overlaps the orange barb along the same axis.
      const hoseTail='C152 17 229 48 281 66 C299 72 318 72 340 72';
      const hose=`M152 40 ${hoseTail}`;
      soft.innerHTML=`<g class="infant-suction-hose" fill="none">
          <path d="${hose}" stroke="#bfdce2" stroke-width="10" opacity=".62"/>
          <path d="${hose}" stroke="#789fa7" stroke-width="7" opacity=".48"/>
          <path d="${hose}" transform="translate(1.5 -1.5)" stroke="#effcff" stroke-width=".7" opacity=".55"/>
          <path d="${hose}" transform="translate(-1.5 1.5)" stroke="#deeff2" stroke-width=".65" opacity=".35"/>
        </g>
        <path d="M328 67 H332 V66 H340 Q342 72 340 78 H332 V77 H328 Z" fill="#467b9b" stroke="#9ac8df" stroke-width=".8"/>
        <path d="M330 67 V77 M333 69 H339" fill="none" stroke="#a6d0e4" stroke-width=".7"/>
        <g fill="none" stroke-linecap="butt">
          <path class="infant-suction-line" d="${ready}" stroke="#edf5f2" stroke-width="5.4"/>
          <path class="infant-suction-line" d="${ready}" stroke="#a9bab8" stroke-width="3.6"/>
          <path class="infant-suction-line" d="${ready}" stroke="#435c5c" stroke-width="4.7" stroke-dasharray=".65 7.35" opacity=".7"/>
        </g>
        <g id="infant-suction-end" transform="translate(145 110) rotate(36)">
          <path d="M-3 -2.7 H.5 L3 -1.1 L1.2 2.7 H-3 Z" fill="#e4efeb" stroke="#a8bfba" stroke-width=".5"/>
          <ellipse cx="1.55" cy=".3" rx=".75" ry="1.6" fill="#576f6e" stroke="none" transform="rotate(22 1.55 .3)"/>
          <ellipse cx="-2.5" cy="-.7" rx=".9" ry=".65" fill="#576f6e" stroke="none"/>
        </g>
        <g id="infant-suction-connector">
        <g fill="#e77b13" stroke="#ffb763" stroke-width=".65">
          <path d="M148 74 Q152 76 156 74 V60 Q156 58 155 57 V48 H149 V57 Q148 58 148 60 Z"/>
          <path d="M149 50 H155 M149 53 H155 M149 56 H155" fill="none" stroke="#ae4a0b" stroke-width=".9"/>
          <path d="M148 62 H142 V58 Q139 57 138 60 V68 Q139 71 142 70 V66 H148 Z"/>
          <ellipse cx="139.8" cy="64" rx="1" ry="3.3" fill="#983b08"/>
          <path d="M140 59 Q134 55 136 49 Q137 46 140 46" fill="none" stroke="#f19437" stroke-width="1.2"/>
          <path d="M139 44 H145 V48 H139 Q137 46 139 44 Z"/>
          <path d="M150 61 V72" fill="none" stroke="#ffbd72" stroke-width="1"/>
        </g>
        <path d="M145 40 Q152 38 159 40 V49 Q159 52 157 54 H147 Q145 52 145 49 Z" fill="#467b9b" fill-opacity=".93" stroke="#9ac8df" stroke-width=".8"/>
        <path d="M146 42 Q152 44 158 42 M147 50 H157" fill="none" stroke="#a6d0e4" stroke-width=".7"/>
        </g>`;
      gear.querySelector('#yankauer').after(soft);
      const flow=gear.querySelector('#suction-flow');
      const infantRoute=`C161 147 150 126 152 98 L152 40 ${hoseTail}`;
      flow.style.setProperty('--infant-suction-flow', `path('M185 164 ${infantRoute}')`);
      // Keep the original staggered routes through the tip and hose, with the
      // initial debris clustered inside this model's smaller oral lumen.
      gear.querySelectorAll('.suction-particle').forEach(particle=>{
        const route=particle.style.offsetPath,point=route.match(/M\s*([\d.]+)\s+([\d.]+)/);
        if(!point)return;
        const x=185+(+point[1]-185)*.75,y=164+(+point[2]-164)*.25;
        particle.style.offsetPath=route.replace(point[0],`M${x} ${y}`);
        particle.style.setProperty('--infant-suction-route', `path('M${x} ${y} L185 164 ${infantRoute}')`);
        particle.style.setProperty('--tip-distance',Math.hypot(x-185,y-164)+'px');
      });
    }
    if(scene==='obstruction')gear.querySelector('#obstruction-burst').setAttribute('transform','translate(-20 -12)');
    if(scene==='obstruction'){
      const object=gear.querySelector('#obstruction-object'),motion=document.createElementNS(ns,'g');motion.classList.add('reference-obstruction-motion');object.before(motion);motion.append(object);
      // The object itself is unchanged; only its simple expulsion route is mapped.
      object.removeAttribute('transform');
      const art=document.createElementNS(ns,'g');art.setAttribute('transform','scale(.8) translate(-232 -170)');while(object.firstChild)art.append(object.firstChild);object.append(art);
      gear.querySelector('#obstruction-flow').setAttribute('d','M150 190 C168 250 196 280 247 281 C282 281 320 285 365 310');
    }
    overlay.dataset.refinedProcedure=scene;
    overlay.style.setProperty('--ra-crop',`url(#${scene}-lx-male-crop)`);
    overlay.style.setProperty('--ra-grain-clip',`url(#${scene}-lx-tongue-grain-clip)`);
    svg.classList.add('ra-svg');
    svg.querySelector('[data-airway-part="lx-palate"]').setAttribute('fill',`url(#${scene}-lx-skin-depth)`);
    svg.querySelector('[data-airway-part="lx-male-tongue"]').classList.add('ra-tongue');
    svg.querySelector('.lx-male-tongue-grain').classList.add('ra-grain');
    old.replaceWith(svg);
  }
  window.AirwayScenes=Object.freeze({profiles:['male','female','child-male','child-female','baby'],procedures:['laryngoscope','sga','opa','npa','suction','obstruction']});
})();
