"""Regenerate i-gel shaft/contact keyframes: python3 scripts/build-igel-contact.py.

Requires NumPy. The cuff geometry comes from IGEL_MODEL in airway-scenes.js;
only the shaft flexes, while each outcome advances the complete device.
The adult male success reference is generated separately by igel_reference.py;
use --adult-male-success to rebuild just that reference.
"""
from pathlib import Path
import re,math,json,sys,numpy as np
sys.dont_write_bytecode=True
if '--adult-male-success' in sys.argv:
 from igel_reference import build
 build(Path(__file__).resolve().parent.parent)
 sys.exit(0)
root=Path(__file__).resolve().parent.parent;p=root/'public/airway-scenes.css';s=p.read_text().split('/* BEGIN RIGID IGEL FIT */')[0];js=(root/'public/airway-scenes.js').read_text();html=(root/'public/index.html').read_text()
restA=re.search('id="lx-male-tongue" d="([^"]+)"',html)[1];restC=re.search(r"--lx-contour-rest:path\('([^']+)'",s)[1]
model=json.loads(re.search(r'const IGEL_MODEL=(\{[^;]+\});',js)[1]);T=np.array([309.,317.]);o=np.array([153.,86.])
ax,ay,bx,by=60,78,130,117;den=ax*ax+ay*ay;ma=(ax*bx+ay*by)/den;mb=(ax*by-ay*bx)/den;matrix=np.array([[ma,-mb],[mb,ma]]);offset=np.array([155-ma*156+mb*120,188-mb*156-ma*120]);ref=lambda q:np.linalg.solve(matrix,np.asarray(q)-offset)
shaft=np.array([matrix@q+offset for q in [[153,86],[151,134],[162,157],[194,173]]]);model['cuff'][0]=list(shaft[-1]);model['cuff'][1]=list(shaft[-1]+(shaft[-1]-shaft[-2])*.26)
def curve(c,t):
 c=np.asarray(c);u=1-t;return u**3*c[0]+3*u*u*t*c[1]+3*u*t*t*c[2]+t**3*c[3]
def deriv(c,t):
 c=np.asarray(c);u=1-t;return 3*(u*u*(c[1]-c[0])+2*u*t*(c[2]-c[1])+t*t*(c[3]-c[2]))
def radius(t,knots=None):
 knots=model['radii'] if knots is None else knots
 for (ta,ra),(tb,rb) in zip(knots,knots[1:]):
  if t<=tb:
   u=(t-ta)/(tb-ta);u=u*u*(3-2*u);return ra+(rb-ra)*u
 return .9
qtip=ref(T)
def bend(pc):
 u=np.clip((pc-28)/30,0,1);return .2*(1-u*u*(3-2*u))
def bent_shaft(pc):
 straight=np.array([shaft[-1]-(3-i)*(shaft[-1]-shaft[-2]) for i in range(4)])
 return shaft*(1-bend(pc))+straight*bend(pc)
def body_at(pc):
 st=bent_shaft(pc);front=[];back=[]
 for t in np.linspace(0,1,121):
  q=curve(st,t);v=deriv(st,t);n=np.array([v[1],-v[0]])/np.linalg.norm(v);front.append(q+n*12.5);back.append(q-n*12.5)
 unit=lambda v:np.asarray(v)/np.linalg.norm(v)
 normal=lambda v:np.array([v[1],-v[0]])
 neck=shaft[3];direction=unit(deriv(shaft,1));tip=np.array(model['cuff'][3]);tipDirection=unit(deriv(model['cuff'],1));tipNormal=normal(tipDirection)
 backCurve=[neck-normal(direction)*12.5,neck-normal(direction)*12.5+direction*model['backReach'],np.array(model['backControl']),np.array(model['backTip'])]
 for t in np.linspace(.01,1,100):
  q=curve(model['cuff'],t);n=normal(unit(deriv(model['cuff'],t)));front.append(q+n*radius(t));back.append(curve(backCurve,t))
 exit=unit(backCurve[2]-backCurve[3]);nose=[front[-1],front[-1]+tipDirection*5,back[-1]-exit*3,back[-1]]
 cap=[curve(nose,t) for t in np.linspace(0,1,17)[1:-1]]
 return np.array(front+cap+back[::-1])
stops={'SUCCESS':(0,0,0),'MARGINAL':(0,-16,5),'FAILURE':(2,-48,15),'COMPLICATION':(-6,-10,12)}
rot=lambda deg:np.array([[math.cos(math.radians(deg)),-math.sin(math.radians(deg))],[math.sin(math.radians(deg)),math.cos(math.radians(deg))]])
ends={key:np.r_[matrix@(o+np.array([dx,dy])+rot(a)@(qtip-o))+offset,a] for key,(dx,dy,a) in stops.items()}
def poses(outcome):
 end=ends[outcome];middle=np.array([274.,296.,12.]) if outcome=='SUCCESS' else np.array([222.,277.,24.])+(end-np.array([222.,277.,24.]))*10/18
 return [(0,145,140,32),(4,145,140,32),(10,150,175,32),(16,150,175,32),(24,168,225,32),(28,168,225,32),(40,222,277,24),(50,*middle),(58,*end),(100,*end)]
def pose(pc,outcome):
 rows=poses(outcome)
 for i,(a,b) in enumerate(zip(rows,rows[1:])):
  if a[0]<=pc<=b[0]:
   h=b[0]-a[0];t=(pc-a[0])/h;va=np.array(a[1:]);vb=np.array(b[1:]);slope=(vb-va)/h
   def velocity(k):
    if k==0 or k==len(rows)-1:return np.zeros(3)
    left=(np.array(rows[k][1:])-rows[k-1][1:])/(rows[k][0]-rows[k-1][0]);right=(np.array(rows[k+1][1:])-rows[k][1:])/(rows[k+1][0]-rows[k][0]);v=np.zeros(3);valid=left*right>0;v[valid]=2/(1/left[valid]+1/right[valid]);return v
   return (2*t**3-3*t*t+1)*va+(t**3-2*t*t+t)*h*velocity(i)+(-2*t**3+3*t*t)*vb+(t**3-t*t)*h*velocity(i+1)
 return np.array(rows[-1][1:])
def parse(d):
 tokens=re.findall('[MLCQZ]|-?\\d+(?:\\.\\d+)?',d);out=[];posterior=[];old=None;cmdCount=0
 def point():return np.array([float(tokens.pop(0)),float(tokens.pop(0))])
 while tokens:
  cmd=tokens.pop(0)
  if cmd=='Z':continue
  if cmd=='M':old=point();out.append(old);continue
  count={'L':1,'Q':2,'C':3}[cmd];c=[old]+[point() for _ in range(count)];cmdCount+=1
  for t in np.linspace(0,1,41)[1:]:
   u=1-t;weights=[u**3,3*u*u*t,3*u*t*t,t**3] if cmd=='C' else [u*u,2*u*t,t*t] if cmd=='Q' else [u,t];out.append(sum(w*q for w,q in zip(weights,c)))
  old=c[-1]
  if cmdCount==3:posterior=list(out)
 return np.array(out),np.array(posterior)
def resample(poly,n,closed=False):
 arr=np.vstack([poly,poly[0]]) if closed else poly;dist=np.r_[0,np.cumsum(np.linalg.norm(np.diff(arr,axis=0),axis=1))];target=np.linspace(0,dist[-1],n,endpoint=not closed);return np.stack([np.interp(target,dist,arr[:,k]) for k in [0,1]],axis=1)
def bounds(poly,ys):
 a=poly;b=np.roll(poly,-1,axis=0);y=np.asarray(ys)[:,None];den=b[:,1]-a[:,1];safe=np.where(abs(den)>1e-9,den,1)
 hits=(a[:,1]>y)!=(b[:,1]>y);x=a[:,0]+(b[:,0]-a[:,0])*(y-a[:,1])/safe
 low=np.min(np.where(hits,x,np.inf),axis=1);high=np.max(np.where(hits,x,-np.inf),axis=1);return low,high

def clean(poly):
 # A morphing leaf may touch the body; retain its continuous outer contour.
 for _ in range(12):
  n=len(poly);found=False
  for i in range(n):
   a=poly[i];b=poly[(i+1)%n];v=b-a
   for j in range(i+2,n):
    if i==0 and j==n-1:continue
    c=poly[j];d=poly[(j+1)%n];w=d-c;det=v[0]*w[1]-v[1]*w[0]
    if abs(det)<1e-8:continue
    z=c-a;t=(z[0]*w[1]-z[1]*w[0])/det;u=(z[0]*v[1]-z[1]*v[0])/det
    if 1e-5<t<1-1e-5 and 1e-5<u<1-1e-5:
     q=a+t*v;part1=np.vstack([poly[:i+1],q,poly[j+1:]]);part2=np.vstack([q,poly[i+1:j+1]])
     area=lambda p:abs(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1)))
     poly=part1 if area(part1)>=area(part2) else part2;found=True;break
   if found:break
  if not found:return poly
 return poly

data={}
for child,d in [(False,restA),(True,restC)]:
 original,posterior=parse(d);prefix=resample(posterior,61);anterior=original[len(posterior)-1:];anterior=np.vstack([anterior,original[0]]);restAnti=resample(anterior,141)
 ys=np.linspace(267,166,150);lo,hi=bounds(original,np.clip(ys,original[:,1].min()+.001,original[:,1].max()-.001));graph=np.stack([lo,ys],axis=1)
 data[child]=(original,prefix,restAnti,graph)

css='\n/* BEGIN RIGID IGEL FIT */\n/* Generated by scripts/build-igel-contact.py. The shaft bends progressively;\n   the mask stays rigid. Positive tissue deformation avoids contour crossings. */\n';pinches=0
polygon=lambda points:'M'+' L'.join(' '.join(f'{v:.4f}' for v in ref(q)) for q in points)+' Z'
def lumen_at(pc):
 return 'M'+' C'.join(' '.join(' '.join(f'{v:.4f}' for v in ref(q)) for q in segment) for segment in [[bent_shaft(pc)[0]],bent_shaft(pc)[1:],[[252.5,272.4],[269,279.65],[282,279]]])
for selector,name,make in [('#sga-stem','flexibleIgelBody',lambda pc:polygon(body_at(pc))),('#sga-lumen','flexibleIgelLumen',lumen_at),('#sga-flow','flexibleIgelLumen',None)]:
 css+='#sga-overlay[data-refined-procedure].visible '+selector+' {animation:'+name+' var(--procedure-duration) linear both;}\n'
 if make:
  css+='@keyframes '+name+' {\n'
  for pc in [0]+list(range(24,59,2))+[100]:css+=f"  {pc}% {{d:path('{make(pc)}');}}\n"
  css+='}\n'
css+='#sga-overlay[data-refined-procedure].visible #sga-proximal {transform-origin:153px 86px;animation:flexibleIgelConnector var(--procedure-duration) linear both;}\n@keyframes flexibleIgelConnector {\n'
for pc in [0]+list(range(24,59,2))+[100]:
 st=bent_shaft(pc);dest=ref(st[0]);v=st[1]-st[0];original=shaft[1]-shaft[0];angle=math.degrees(math.atan2(v[1],v[0])-math.atan2(original[1],original[0]));delta=dest-o
 css+=f'  {pc}% {{transform:translate({delta[0]:.4f}px,{delta[1]:.4f}px) rotate({angle:.4f}deg);}}\n'
css+='}\n'
for outcome in stops:
 selector='#sga-overlay[data-refined-procedure].outcome-'+outcome+'.visible';name='rigidIgelAdvance'+outcome;css+=selector+' #sga-device {animation-name:'+name+';}\n@keyframes '+name+' {\n'
 for pc in list(range(59))+[100]:
  x,y,angle=pose(pc,outcome)
  dest=ref([x,y]);translation=dest-(o+rot(angle)@(qtip-o));opacity=0 if pc<=4 else 1;css+=f'  {pc}% {{opacity:{opacity};transform:translate({translation[0]:.4f}px,{translation[1]:.4f}px) rotate({angle:.4f}deg);}}\n'
 css+='}\n'
 for child in [False,True]:
  original,prefix,restAnti,graph=data[child];name='rigidIgelTongue'+outcome+('Child' if child else 'Adult');sc=selector+(':is([data-airway-profile^="child-"],[data-airway-profile="baby"])' if child else '');css+=sc+' .ra-tongue {animation-name:'+name+';}\n@keyframes '+name+' {\n'
  for pc in [0,24]+list(range(25,59))+[100]:
   x,y,angle=pose(pc,outcome);z=max(0,min(1,(x-208)/30));z=z*z*(3-2*z)
   control=np.array([235+24*z,307-40*z]);base=np.array([(1-t)**2*np.array([282.,267.])+2*(1-t)*t*control+t*t*graph[0] for t in np.linspace(0,1,61)])
   pouch=resample(np.vstack([base,graph[1:]]),141);anti=restAnti*(1-z)+pouch*z;poly=clean(np.vstack([prefix,anti[1:-1]]));poly=resample(poly,190,True)
   actualBody=(body_at(pc)-T)@rot(angle).T+np.array([x,y]);query=np.clip(poly[:,1],poly[:,1].min()+.001,poly[:,1].max()-.001);f,b=bounds(poly,query);_,device=bounds(actualBody,query)
   desired=np.maximum(f,np.where(np.isfinite(device),device+1.25,f));movement=np.maximum(0,desired-f);dy=query[:,None]-query[None,:];movement=np.max(movement[None,:]*np.exp(-dy*dy/32),axis=1);desired=f+movement;pinches+=int(np.sum((desired>b-.75)&((b-f)>1)&np.isfinite(device)));desired=np.minimum(desired,b-.75);width=np.maximum(1e-5,b-f);scale=np.clip((b-desired)/width,.005,1);valid=(width>.1)&np.isfinite(width);poly[:,0]=np.where(valid,b-(b-poly[:,0])*scale,poly[:,0]);poly=clean(poly);poly=resample(poly,190,True)
   # Anchor the contour at the crown for stable interpolation and grain clipping.

   d='M'+ ' L'.join(' '.join(f'{v:.5f}'.rstrip('0').rstrip('.') for v in q) for q in poly)+' Z';css+=f"  {pc}% {{d:path('{d}');}}\n"
  css+='}\n'
css+='/* END RIGID IGEL FIT */\n';p.write_text(s+css);print('Generated positive tissue deformations; constrained samples:',pinches)

# Keep the reviewed adult male success refinement after a shared fit rebuild.
from igel_reference import build
build(root)
