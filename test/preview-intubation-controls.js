'use strict';
const overlay = document.getElementById('laryngoscope-overlay');
overlay.dataset.airwayProfile = 'male';
overlay.style.transition = 'none';
overlay.style.setProperty('--procedure-duration', '7200ms');
overlay.style.setProperty('--procedure-result', '6480ms');
document.getElementById('laryngoscope-header').textContent = 'ADULT MALE · INTUBATION';
let animations = [], playing = false;
function seek(time) {
  playing = false;
  animations.forEach(a => { a.pause(); a.currentTime = time; });
  document.getElementById('time').value = time;
  document.getElementById('stamp').textContent = Math.round(time) + ' ms';
}
function reset() {
  overlay.className = '';
  void overlay.offsetWidth;
  overlay.className = 'visible outcome-' + document.getElementById('outcome').value;
  document.getElementById('laryngoscope-label').textContent = document.getElementById('outcome').value;
  animations = overlay.getAnimations({subtree:true});
  seek(0);
}
reset();
document.getElementById('audit').insertAdjacentHTML('beforebegin', '<button data-frame="3960">Tube entering</button><button data-frame="4608">Tube seated</button><button data-frame="6880">Cuff inflated</button>');
document.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => seek(+b.dataset.frame));
document.getElementById('time').oninput = e => seek(+e.target.value);
document.getElementById('outcome').onchange = reset;
document.getElementById('play').onclick = () => {
  if (playing) return seek(animations[0]?.currentTime || 0);
  if ((animations[0]?.currentTime || 0) > 7100) seek(0);
  animations.forEach(a => a.play()); playing = true;
};
function tick() {
  if (playing) {
    const time = Math.min(7199, animations[0]?.currentTime || 0);
    document.getElementById('time').value = time;
    document.getElementById('stamp').textContent = Math.round(time) + ' ms';
    if (time >= 7199) seek(7199);
  }
  requestAnimationFrame(tick);
}
tick();
document.getElementById('audit').onclick = async () => {
  try {
  document.getElementById('report').textContent = 'Checking insertion, lift and withdrawal…';
  const tissues = [['tongue',document.getElementById('lx-male-tongue')],['palate',document.getElementById('lx-palate')],['septum',document.getElementById('lx-airway-septum')],['anterior wall',document.getElementById('lx-anterior-neck-tissue')],['face',document.querySelector('#lx-head .airway-profile-male')],...Array.from(document.querySelectorAll('.airway-teeth path')).filter(el=>getComputedStyle(el).display!=='none').map(el=>['teeth',el])];
  const pharynx = document.getElementById('lx-pharynx');
  const metal = [document.getElementById('lx-male-mac-blade') || document.getElementById('lx-mac-blade'),document.querySelector('#lx-mac-handle > rect'),document.getElementById('lx-mac-hinge')];
  const samples = metal.map(el=>{const points=[],b=el.getBBox();if(el.getTotalLength)for(let l=0;l<el.getTotalLength();l+=1)points.push(el.getPointAtLength(l));for(let x=b.x;x<=b.x+b.width;x+=1.5)for(let y=b.y;y<=b.y+b.height;y+=1.5){const p=new DOMPoint(x,y);if(el.isPointInFill(p))points.push(p);}return {el,points};});
  const hits=[];
  for(let percent=4;percent<=98;percent+=.25){
    seek(percent*72);
    if (percent % 2 === 0) await new Promise(requestAnimationFrame);
    for(const {el,points} of samples)for(const [name,tissue] of tissues){
      const b=tissue.getBBox();
      const m=tissue.getScreenCTM().inverse().multiply(el.getScreenCTM());
      for(const local of points){const p=local.matrixTransform(m);if(p.x<b.x-2||p.x>b.x+b.width+2||p.y<b.y-2||p.y>b.y+b.height+2)continue;if(!tissue.isPointInFill(p) && !(name==='teeth' && [[-2,0],[2,0],[0,-2],[0,2]].some(([dx,dy])=>tissue.isPointInFill(new DOMPoint(p.x+dx,p.y+dy)))))continue;if(name==='face'&&pharynx.isPointInFill(p))continue;hits.push({percent,part:el.id||'handle',tissue:name,x:+p.x.toFixed(1),y:+p.y.toFixed(1)});break;}
    }
  }
  const outcome=document.getElementById('outcome').value;
  const route=document.querySelector('#lx-tube-'+(outcome==='COMPLICATION'?'esophageal':outcome==='FAILURE'?'failed':'tracheal')+' .lx-tube-wall');
  for(let percent=45;percent<=100;percent+=.25){
    seek(percent*72);
    if(+getComputedStyle(document.getElementById('lx-tube-assembly')).opacity<.1)continue;
    const trachea=document.getElementById('lx-trachea');
    const trachealMatrix=trachea.getScreenCTM().inverse().multiply(route.getScreenCTM());
    const matrices=tissues.map(([name,tissue])=>[name,tissue,tissue.getScreenCTM().inverse().multiply(route.getScreenCTM())]);
    for(let l=0;l<route.getTotalLength();l+=2){
      const p=route.getPointAtLength(l),next=route.getPointAtLength(Math.min(route.getTotalLength(),l+1)),dx=next.x-p.x,dy=next.y-p.y,n=Math.hypot(dx,dy)||1;
      for(const offset of [-4.75,0,4.75]){
        const q=new DOMPoint(p.x-dy/n*offset,p.y+dx/n*offset),airway=q.matrixTransform(trachealMatrix);
        for(const[name,tissue,matrix]of matrices){
          const local=q.matrixTransform(matrix);
          if(!tissue.isPointInFill(local))continue;
          if(name==='face'&&pharynx.isPointInFill(local))continue;
          if(name==='tongue'&&trachea.isPointInFill(airway))continue;
          hits.push({percent,part:'tube',tissue:name,x:+local.x.toFixed(1),y:+local.y.toFixed(1)});
          break;
        }
      }
    }
    if(percent%2===0)await new Promise(requestAnimationFrame);
  }
  let cuffSeal='';
  if(outcome==='SUCCESS'||outcome==='MARGINAL'){
    seek(45*72);const before=getComputedStyle(route).d;
    seek(56.5*72);if(getComputedStyle(route).d!==before)hits.push({part:'tube',tissue:'pre-cord deformation',percent:56.5});
    // Deflated cuff must be centered on, and tangent to, the tube.
    seek(64*72);
    const airway=document.getElementById('lx-trachea');
    const cuffFrame=airway.getScreenCTM().inverse().multiply(document.getElementById('lx-male-cuff-position').getScreenCTM());
    const routeFrame=airway.getScreenCTM().inverse().multiply(route.getScreenCTM());
    let closest={distance:Infinity,length:0};
    for(let l=0;l<=route.getTotalLength();l+=.25){const p=route.getPointAtLength(l).matrixTransform(routeFrame),distance=Math.hypot(p.x-cuffFrame.e,p.y-cuffFrame.f);if(distance<closest.distance)closest={distance,length:l};}
    const beforeCuff=route.getPointAtLength(closest.length-.25).matrixTransform(routeFrame),afterCuff=route.getPointAtLength(closest.length+.25).matrixTransform(routeFrame);
    const alignment=Math.abs(Math.atan2(afterCuff.y-beforeCuff.y,afterCuff.x-beforeCuff.x)-Math.atan2(cuffFrame.b,cuffFrame.a))*180/Math.PI;
    if(alignment>.5||closest.distance>.35)hits.push({part:'cuff',tissue:'deflated alignment',percent:64,alignment,distance:closest.distance});
    // Joining cubic segments must not introduce a hooked or crooked distal end.
    for(const percent of [57,58.5,60,62,64,72,82]){
      seek(percent*72);const d=getComputedStyle(route).d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const entry=Math.atan2(d[19]-d[17],d[18]-d[16]),exit=Math.atan2(d[21]-d[19],d[20]-d[18]);
      if(Math.abs(entry-exit)*180/Math.PI>.1)hits.push({part:'tube',tissue:'distal kink',percent});
    }
    seek(100*72);
    const cuff=document.getElementById('lx-male-cuff'),lumen=document.getElementById('lx-trachea');
    const matrix=cuff.getScreenCTM().inverse().multiply(lumen.getScreenCTM());
    let width=0,sealed=0;
    const cuffAxis=lumen.getScreenCTM().inverse().multiply(document.getElementById('lx-male-cuff-position').getScreenCTM());
    const cuffAngle=Math.atan2(cuffAxis.b,cuffAxis.a);
    for(let d=-20;d<=20;d+=.25){const p=new DOMPoint(cuffAxis.e-Math.sin(cuffAngle)*d,cuffAxis.f+Math.cos(cuffAngle)*d);if(!lumen.isPointInFill(p))continue;width++;if(cuff.isPointInFill(p.matrixTransform(matrix)))sealed++;}
    cuffSeal=` Cuff spans ${Math.round(sealed/width*100)}% of the tracheal width.`;
    if(sealed<width)hits.push({part:'cuff',tissue:'incomplete seal',percent:100,width,sealed});
  }
  document.getElementById('report').textContent = hits.length ? `${hits.length} intersections. First: ${JSON.stringify(hits.slice(0, 6))}. Groups: ${JSON.stringify([...new Set(hits.map(h=>h.part+'/'+h.tissue))])} Last: ${JSON.stringify(hits.slice(-3))}` : 'PASS · full blade, handle and hinge clear tongue, palate, face and teeth at 377 frames; full tube wall stays clear of visible tissue; preformed oral curve stays rigid until the cords; distal bend and deflated cuff stay aligned.' + cuffSeal;
  seek(hits.length ? hits[0].percent*72 : 2160);
  } catch (error) {
    document.getElementById('report').textContent = 'FAIL · ' + error.message;
  }
};
