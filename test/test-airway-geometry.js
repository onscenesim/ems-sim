'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const pediatric=fs.readFileSync(path.join(__dirname,'../public/airway-scenes.css'),'utf8');
function keyframes(name,source=css){
 const start=source.indexOf('@keyframes '+name+' {');assert.ok(start>=0,name);
 const body=source.slice(source.indexOf('{',start)+1,source.indexOf('\n}',start));const rows=[];
 for(const match of body.matchAll(/([\d.% ,]+)\{([^}]+)\}/g))for(const pc of match[1].matchAll(/([\d.]+)%/g))rows.push({pc:+pc[1],value:match[2]});
 return rows.sort((a,b)=>a.pc-b.pc);
}
const numbers=s=>(s.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
const shape=row=>numbers(row.value.match(/path\('([^']+)'/)[1]);
function at(rows,pc,read){
 let a=rows[0],b=rows.at(-1);for(let i=1;i<rows.length;i++)if(rows[i].pc>=pc){a=rows[i-1];b=rows[i];break;}
 const t=b.pc===a.pc?0:Math.max(0,Math.min(1,(pc-a.pc)/(b.pc-a.pc))),x=read(a),y=read(b);
 return x.map((v,i)=>v+(y[i]-v)*t);
}
function contains(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function polygon(d){
 const tokens=d.match(/[MLCQZHV]|-?\d+(?:\.\d+)?/g),out=[];let p=[0,0],start,cmd;
 const next=()=>[+tokens.shift(),+tokens.shift()];
 while(tokens.length){if(/^[A-Z]$/.test(tokens[0]))cmd=tokens.shift();if(cmd==='Z'){out.push(start);p=start;continue;}if(cmd==='M'){p=next();start=p;out.push(p);cmd='L';continue;}
  let controls=[],q;if(cmd==='H')q=[+tokens.shift(),p[1]];else if(cmd==='V')q=[p[0],+tokens.shift()];else{controls=cmd==='C'?[next(),next()]:cmd==='Q'?[next()]:[];q=next();}
  for(let i=1;i<=80;i++){const t=i/80,u=1-t;out.push([0,1].map(k=>controls.length===2?u**3*p[k]+3*u*u*t*controls[0][k]+3*u*t*t*controls[1][k]+t**3*q[k]:controls.length===1?u*u*p[k]+2*u*t*controls[0][k]+t*t*q[k]:u*p[k]+t*q[k]));}p=q;
 }return out;
}
const svgPath=id=>html.match(new RegExp('id="'+id+'"[^>]*d="([^"]+)"'))[1];

test('the arriving tube body has a broad smooth bend, without an elbow or reversed distal curvature',()=>{
 const data=shape(keyframes('lxMaleTubePass')[0]);let p=data.slice(0,2),previous;
 for(let i=2;i<data.length;i+=6){
  const c=[p,data.slice(i,i+2),data.slice(i+2,i+4),data.slice(i+4,i+6)],start=c[1].map((v,k)=>v-c[0][k]);
  if(previous){const cross=start[0]*previous[1]-start[1]*previous[0];assert.ok(Math.abs(cross)/Math.hypot(...start)/Math.hypot(...previous)<.001,'tangent discontinuity '+JSON.stringify({c,previous,start}));}
  for(let j=0;j<=100;j++){const t=j/100,u=1-t,a=[0,1].map(k=>3*(u*u*(c[1][k]-c[0][k])+2*u*t*(c[2][k]-c[1][k])+t*t*(c[3][k]-c[2][k]))),b=[0,1].map(k=>6*(u*(c[2][k]-2*c[1][k]+c[0][k])+t*(c[3][k]-2*c[2][k]+c[1][k]))),cross=a[0]*b[1]-a[1]*b[0],curvature=Math.abs(cross)/Math.hypot(...a)**3;
   assert.ok(curvature<1/150,'preformed body develops a tight elbow');assert.ok(cross<.5,'distal body reverses its curvature');
  }previous=c[3].map((v,k)=>v-c[2][k]);p=c[3];
 }
});

test('complication enters the esophageal lumen directly instead of crossing from the trachea',()=>{
 const routes=keyframes('lxMaleTubeEsophageal'),motion=keyframes('lxDirectEsophagealMotion');
 const trachea=polygon(css.match(/#laryngoscope-overlay\[data-refined-airway\] #lx-trachea \{\s*d: path\('([^']+)'/)[1]),esophagus=polygon(svgPath('lx-esophagus'));
 const read=row=>row.value.includes('transform:none')?[278,304,0,-278,-304]:numbers(row.value);
 for(let pc=45;pc<=100;pc+=.25){const d=at(routes,pc,shape),m=at(motion,pc,read),r=m[2]*Math.PI/180,x=d.at(-2)+m[3],y=d.at(-1)+m[4],tip=[m[0]+x*Math.cos(r)-y*Math.sin(r),m[1]+x*Math.sin(r)+y*Math.cos(r)];
  assert.equal(contains(tip,trachea),false,'tracheal entry at '+pc+'%');if(pc>=58)assert.equal(contains(tip,esophagus),true,'missing esophagus at '+pc+'%');
 }
});

test('the filled pediatric tongue stays within the head and oral opening',()=>{
 const head=polygon(html.slice(html.indexOf('<g id="lx-head"')).match(/class="airway-profile-child" d="([^"]+)"/)[1]),air=polygon(svgPath('lx-pharynx'));
 const contours=[...pediatric.matchAll(/--lx-contour-\w+:path\('([^']+)'/g)].map(m=>m[1]);assert.ok(contours.length>=4);
 for(const contour of contours)for(const p of polygon(contour)){
  // Boundary sampling has a tiny allowance for the shared outline stroke.
  const inside=contains(p,head)||contains(p,air)||[[.5,0],[-.5,0],[0,.5],[0,-.5]].some(v=>contains([p[0]+v[0],p[1]+v[1]],head)||contains([p[0]+v[0],p[1]+v[1]],air));
  assert.ok(inside,'tongue protrudes through face at '+p.join(','));
 }
});

test('i-gel insertion keeps a continuous tongue outline without self-crossing loops',()=>{
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
 const variants=['SUCCESS','MARGINAL','FAILURE','COMPLICATION'].flatMap(outcome=>['Adult','Child'].map(profile=>'rigidIgelTongue'+outcome+profile));
 for(const variant of variants){
  const rows=keyframes(variant,pediatric);
  assert.ok(rows.length>20);
  for(const row of rows){const data=shape(row),points=[];for(let i=0;i<data.length;i+=2)points.push(data.slice(i,i+2));
   for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length],v=sub(b,a),w=sub(d,c),det=cross(v,w);if(Math.abs(det)<1e-8)continue;
    const z=sub(c,a),t=cross(z,w)/det,u=cross(z,v)/det;
    assert.ok(!(t>1e-5&&t<1-1e-5&&u>1e-5&&u<1-1e-5),`${variant} tongue crosses itself at ${row.pc}%`);
   }
  }
 }
});

test('i-gel shaft progressively curves without moving the rigid mask joint',()=>{
 for(const name of ['flexibleIgelLumen']){
 const rows=keyframes(name,pediatric),early=shape(rows[0]),seated=shape(rows.at(-1));
 // The second cubic is the rigid mask channel; its start and tangent stay fixed.
 for(const row of rows){const d=shape(row);assert.deepEqual(d.slice(6),seated.slice(6));}
 const turn=d=>{
  const a=[d[2]-d[0],d[3]-d[1]],b=[d[6]-d[4],d[7]-d[5]];
  return Math.acos((a[0]*b[0]+a[1]*b[1])/Math.hypot(...a)/Math.hypot(...b));
 };
 assert.ok(turn(early)<turn(seated)-.1,'shaft should begin straighter');
 }
});

function igelWorldPoints(row){
 const d=shape(row),pose=keyframes('rigidIgelMaleSuccessAdvanceSUCCESS',pediatric).find(p=>p.pc===row.pc);
 const [dx,dy,angle]=numbers(pose.value.match(/transform:([^;]+)/)[1]),r=angle*Math.PI/180;
 const a=(60*130+78*117)/(60*60+78*78),b=(60*117-78*130)/(60*60+78*78);
 const points=[];
 for(let i=0;i<d.length-6;i+=2){const x=d[i]-153,y=d[i+1]-86,q=[153+dx+x*Math.cos(r)-y*Math.sin(r),86+dy+x*Math.sin(r)+y*Math.cos(r)];points.push([a*(q[0]-156)-b*(q[1]-120)+155,b*(q[0]-156)+a*(q[1]-120)+188]);}
 return points;
}

test('adult male spine is shifted posteriorly while the cuff tip retains its seated target',()=>{
 const points=igelWorldPoints(keyframes('flexibleIgelMaleSuccessLumen',pediatric).at(-1));
 for(const guide of [[155.5,125],[155.5,200],[169.5,250],[196.5,284],[229.5,302]])assert.ok(Math.min(...points.map(p=>Math.hypot(p[0]-guide[0],p[1]-guide[1])))<3,'shaft misses fitted route at '+guide);
 assert.ok(Math.abs(points.at(-1)[0]-229.9619)<.01);
 assert.ok(Math.abs(points.at(-1)[1]-301.1942)<.01);
});

test('adult male shaft feeds through one bend without stretching or moving across the mouth',()=>{
 const rows=keyframes('flexibleIgelMaleSuccessLumen',pediatric),poses=keyframes('rigidIgelMaleSuccessAdvanceSUCCESS',pediatric);
 const a=(60*130+78*117)/(60*60+78*78),b=(60*117-78*130)/(60*60+78*78),origin=[153,86];
 let joint,previousTurn=0;
 for(const row of rows){
  const d=shape(row),points=[];for(let i=0;i<d.length-6;i+=2)points.push(d.slice(i,i+2));
  joint??=points.at(-1);assert.deepEqual(points.at(-1),joint,'cuff attachment must stay fixed');
  const pose=poses.find(p=>p.pc===row.pc),[dx,dy,angle]=numbers(pose.value.match(/transform:([^;]+)/)[1]);
  const r=angle*Math.PI/180,world=points.map(([x,y])=>{x-=origin[0];y-=origin[1];const q=[origin[0]+dx+x*Math.cos(r)-y*Math.sin(r),origin[1]+dy+x*Math.sin(r)+y*Math.cos(r)];return [a*(q[0]-156)-b*(q[1]-120)+155,b*(q[0]-156)+a*(q[1]-120)+188];});
  const length=world.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-world[i][0],p[1]-world[i][1]),0);
  assert.ok(Math.abs(length-207.6088)<.03,'shaft stretches at '+row.pc+'%');
  for(const p of world.slice(0,40))assert.ok(Math.abs(p[0]-155.5)<.01,'proximal shaft wiggles across the mouth');
  let turn=0;
  for(let i=2;i<world.length;i++){
   const u=world[i-1].map((v,k)=>v-world[i-2][k]),v=world[i].map((v,k)=>v-world[i-1][k]);
   const change=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
   assert.ok(change<.002,'shaft reverses its bend');turn-=change;
  }
  assert.ok(turn>=previousTurn-.002,'shaft unbends during advancement');previousTurn=turn;
  if(row.pc<=24)assert.ok(Math.abs(turn)<.002,'shaft bends before throat contact');
 }
});

test('adult male i-gel preserves the exact original tongue anatomy without deformation',()=>{
 const rule=pediatric.match(/\.outcome-SUCCESS\.visible \.ra-tongue \{animation:none;d:var\(--lx-contour-rest,path\('([^']+)'/);
 assert.ok(rule,'tongue must stay still');
 assert.equal(rule[1],svgPath('lx-male-tongue'));
 assert.ok(!fs.readFileSync(path.join(__dirname,'../public/airway-scenes.js'),'utf8').includes('sga-reference-epiglottis'),'do not add a separate epiglottis');
});

test('success profiles share a rounded cuff and a matching lumen clip',()=>{
 const scope='#sga-overlay[data-refined-procedure][data-airway-profile].outcome-SUCCESS';
 const block=pediatric.split('/* BEGIN ADULT MALE IGEL REFERENCE */')[1];
 const ruleFor=selector=>{
  const rule=block.split('\n').find(line=>line.startsWith(scope+' '+selector+' {'));
  assert.ok(rule,selector);
  return rule;
 };
 const points=d=>{
  const coordinates=numbers(d);
  return Array.from({length:coordinates.length/2},(_,i)=>coordinates.slice(2*i,2*i+2));
 };
 const pathFor=selector=>ruleFor(selector).match(/d:path\('([^']+)'\)/)[1];
 const seal=points(pathFor('#sga-seal')),clip=points(pathFor('#sga-shell-clip path:first-child'));
 assert.match(ruleFor('#sga-seal'),/fill:var\(--igel-cuff-color\);/);
 assert.ok(pathFor('#sga-seal').endsWith('Z'),'the cuff must be a closed shape');
 const upper=points(pathFor('#sga-seal-border')),underside=points(pathFor('#sga-bulb-outline'));
 assert.ok(!pathFor('#sga-seal-border').endsWith('Z'),'the upper rim follows the outer edge only');
 assert.match(ruleFor('#sga-bulb-outline'),/stroke:var\(--igel-spine\);/);
 assert.deepEqual(upper.at(-1),underside.at(-1),'both rims must meet at the seated tip');
 assert.deepEqual(seal.slice(0,upper.length),upper,'the upper rim must follow the cuff');
 const seam=[seal[0],...seal.slice(upper.length-1).reverse()];
 assert.deepEqual(seam,clip.slice(0,seam.length),'the lumen clip must follow the curved seam');
 assert.deepEqual(clip.slice(seam.length),underside.slice(0,-1).reverse(),'the lumen clip must follow the posterior rim');
 const [x,y]=seam[0],[tipX,tipY]=seam.at(-1);
 const bulge=([px,py])=>((tipX-x)*(py-y)-(tipY-y)*(px-x))/Math.hypot(tipX-x,tipY-y);
 assert.ok(Math.max(...seam.map(bulge))>3,'the cuff should bow out from the shaft-to-tip chord');
});

test('adult male hard palate stays fixed while only the posterior throat yields',()=>{
 const block=pediatric.split('/* BEGIN ADULT MALE IGEL REFERENCE */')[1];
 const rule=block.match(/\[data-airway-part="lx-palate"\] \{animation:none;transform:none;d:path\('([^']+)'/);
 assert.ok(rule,'hard palate must not animate');assert.equal(rule[1],svgPath('lx-palate'));
 assert.ok(!block.includes('@keyframes igelContactlxpalate'));
 for(const part of ['lx-esophagus','lx-male-pharynx-outline']){
  const rows=keyframes('igelContact'+part.replaceAll('-',''),pediatric);
  const start=shape(rows[0]),end=shape(rows.at(-1));
  assert.equal(start.length,end.length,'throat paths cannot interpolate');
  assert.ok(start.some((v,i)=>Math.abs(v-end[i])>3),'wall never yields to the cuff');
  assert.ok(start.every((v,i)=>Math.abs(v-end[i])<=17),'throat deformation is too large');
  for(const row of rows.filter(row=>row.pc<=54.8))assert.deepEqual(shape(row),start,'throat moves before the device reaches it');
  assert.ok(rows.some(row=>row.pc>54.8&&row.pc<58&&shape(row).some((v,i)=>v!==start[i])),'throat must yield at contact');
 }
});

test('i-gel Plus has a narrow connector, rear oxygen port, and matching size band/cap',()=>{
 const connector=html.slice(html.indexOf('<g id="sga-connector"'),html.indexOf('<!-- Gloved grip',html.indexOf('<g id="sga-connector"')));
 assert.match(connector,/data-projection="lateral"/);
 assert.match(connector,/id="sga-universal-connector"[^>]*width="8"/);
 assert.match(connector,/id="sga-oxygen-port"/);
 assert.match(connector,/id="sga-oxygen-cap"[^>]*fill="var\(--igel-size-color\)"/);
 assert.match(connector,/id="sga-size-band"[^>]*fill="var\(--igel-size-color\)"/);
 for(const size of [1,3,4])assert.match(connector,new RegExp('class="sga-size-'+size+'"[^>]*>'+size+'</text>'));
 assert.match(pediatric,/#sga-overlay\[data-airway-profile\^="child-"\] \{--igel-size-color:#f2ce36;/);
 assert.match(pediatric,/#sga-overlay\[data-airway-profile="baby"\] \{--igel-size-color:#ef83ac;/);
});
