"""Successful i-gel placement: a rigid mask fed through one throat bend.

All measurements use the reviewed anatomy's SVG frame. The shaft has fixed
material length: a straight proximal segment feeds a single circular bend.
The bend advances down the posterior contact zone on the same x=155.5 entry
axis. No independent whole-shaft spline morph is involved.
"""
import math
import re
from pathlib import Path
import numpy as np

NECK = np.array([235., 293.])
TIP = np.array([310., 270.5])
SEATED_TIP = np.array([308.0437472546, 307.0662023187])
SEATED_ANGLE = 21.
ENTRY_X = 155.5
HALF_WIDTH = 12.5
# The rounded cuff begins along the shaft tangent and ends at the seated tip.
FRONT = np.array([[235., 280.5], [247., 280.5], [249., 266.5], [254., 266.5]])
SPINE = np.array([FRONT[-1], [266., 266.5], [287., 264.3], [310., 266.6]])
NOSE = np.array([SPINE[-1], [312., 266.8], [312., 269.3], TIP])
BACK = np.array([[235., 305.5], [266., 298.], [293., 285.], TIP])
SEAL_RETURN = np.array([FRONT[0], [260., 280.5], [285., 289.], TIP])



def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def rotation(degrees):
    a = math.radians(degrees)
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


END_NECK = SEATED_TIP - rotation(SEATED_ANGLE) @ (TIP - NECK)
MAX_BEND = math.radians(90 - SEATED_ANGLE)
RADIUS = (END_NECK[0] - ENTRY_X) / (1 - math.cos(MAX_BEND))
HINGE = np.array([ENTRY_X, END_NECK[1] - RADIUS*math.sin(MAX_BEND)])
LENGTH = HINGE[1] - 125. + RADIUS*MAX_BEND


def bezier(c, t):
    u = 1 - t
    return u**3*c[0] + 3*u*u*t*c[1] + 3*u*t*t*c[2] + t**3*c[3]


def back_at(t):
    # Only soften the first fifth of the underside. Keep the traced outline
    # thereafter, while matching the shaft's horizontal attachment tangent.
    cut=.2
    if t>=cut:return bezier(BACK,t)
    a=(1-cut)*BACK[:-1]+cut*BACK[1:]
    b=(1-cut)*a[:-1]+cut*a[1:]
    end=(1-cut)*b[0]+cut*b[1]
    first=a[0].copy();first[1]=BACK[0,1]
    return bezier(np.array([BACK[0],first,b[0],end]),t/cut)


def geometry(pc):
    """Return the material centerline, normals, and rigid mask pose."""
    u = float(smooth((pc - 24) / 40))
    alpha = u * MAX_BEND
    # The growing contact arc turns the distal device once. Its radius stays
    # wider than the tube wall, so the inner edge cannot fold into a loop.
    tip_x, tip_y = TIP - NECK
    seated_y = RADIUS*math.sin(MAX_BEND) + tip_x*math.cos(MAX_BEND) + tip_y*math.sin(MAX_BEND)
    target_y = tip_x + (seated_y - tip_x)*u
    minimum_radius = HALF_WIDTH + 1.5
    radius = minimum_radius if alpha < 1e-8 else max(minimum_radius, (target_y - tip_x*math.cos(alpha)) / math.sin(alpha) - tip_y)
    arc = radius * alpha
    proximal = LENGTH - arc
    hinge = HINGE.copy()
    hinge[1] = 180 + (HINGE[1] - 180)*u
    if pc < 24:
        hinge[1] = 82 + 98 * float(smooth((pc - 4) / 20))
    neck = hinge + radius * np.array([1 - math.cos(alpha), math.sin(alpha)])
    beta = 90 - math.degrees(alpha)
    points, normals = [], []
    for material in np.linspace(0, LENGTH, 161):
        if material <= proximal or alpha < 1e-8:
            point = hinge + [0, material - proximal]
            tangent = np.array([0., 1.])
        else:
            phi = (material - proximal) / radius
            point = hinge + radius * np.array([1 - math.cos(phi), math.sin(phi)])
            tangent = np.array([math.sin(phi), math.cos(phi)])
        points.append(NECK + rotation(-beta) @ (point - neck))
        normals.append(rotation(-beta) @ np.array([tangent[1], -tangent[0]]))
    return np.array(points), np.array(normals), neck, beta


def build(root):
    root = Path(root)
    file = root / 'public/airway-scenes.css'
    source = file.read_text().split('/* BEGIN ADULT MALE IGEL REFERENCE */')[0].rstrip()
    html = (root / 'public/index.html').read_text()
    a = (60*130 + 78*117) / (60*60 + 78*78)
    b = (60*117 - 78*130) / (60*60 + 78*78)
    matrix = np.array([[a, -b], [b, a]])
    offset = np.array([155 - a*156 + b*120, 188 - b*156 - a*120])
    ref = lambda p: np.linalg.solve(matrix, np.asarray(p) - offset)
    xy = lambda p: ' '.join(f'{v:.4f}' for v in ref(p))
    poly = lambda ps: 'M' + ' L'.join(xy(p) for p in ps) + ' Z'
    anatomy = lambda ps: 'M' + ' L'.join(' '.join(f'{v:.4f}' for v in p) for p in ps)
    front = (
        [bezier(FRONT, t) for t in np.linspace(0, 1, 41)]
        + [bezier(SPINE, t) for t in np.linspace(0, 1, 41)[1:]]
        + [bezier(NOSE, t) for t in np.linspace(0, 1, 17)[1:]]
    )
    back = [back_at(t) for t in np.linspace(0, 1, 81)]
    lower_edge = [bezier(SEAL_RETURN, t) for t in np.linspace(0, 1, 81)]
    green = front + lower_edge[-2:0:-1]
    bulb = poly(front + back[-2::-1])
    blue_edge = poly(back).removesuffix(' Z')
    green_edge = poly(front).removesuffix(' Z')
    # The lumen and gastric channel are drawn above the cuff. Clip both to
    # the gray shell so the curved seam and green fill remain visible.
    lumen_clip = poly(lower_edge + back[-2::-1])
    to_world = lambda q: END_NECK + rotation(SEATED_ANGLE) @ (np.asarray(q) - NECK)
    channel = [NECK + [14.,0.], NECK + rotation(-SEATED_ANGLE) @ (np.array([280.,290.])-END_NECK), NECK + rotation(-SEATED_ANGLE) @ (np.array([292.,282.])-END_NECK)]
    frames = [0, 24] + list(range(25, 65)) + [100]
    scope = '#sga-overlay[data-refined-procedure][data-airway-profile].outcome-SUCCESS'
    css = ['/* BEGIN ADULT MALE IGEL REFERENCE */',
           '/* Generated by scripts/igel_reference.py. Constant shaft length, one',
           '   throat contact arc, rigid cuff, and unchanged tongue anatomy. */']

    def rule(selector, value):
        css.append(f'{scope} {selector} {{{value}}}')

    def animation(selector, name, rows):
        rule(selector, f'animation:{name} var(--procedure-duration) linear both;')
        css.append(f'@keyframes {name} {{')
        css.extend(f'  {pc}% {{{value}}}' for pc, value in rows)
        css.append('}')

    def body_at(pc):
        p, n, _, _ = geometry(pc)
        return poly(list(p + n*HALF_WIDTH) + front[1:] + back[-2::-1] + list((p - n*HALF_WIDTH)[::-1]))

    def lumen_at(pc):
        p, _, _, _ = geometry(pc)
        return 'M' + ' L'.join(xy(q) for q in p) + ' C' + ' '.join(xy(q) for q in channel)

    animation('.visible #sga-stem', 'flexibleIgelMaleSuccessBody',
              [(pc, f"d:path('{body_at(pc)}');") for pc in frames])
    animation('.visible :is(#sga-lumen,#sga-gastric-channel)', 'flexibleIgelMaleSuccessLumen',
              [(pc, f"d:path('{lumen_at(pc)}');") for pc in frames])
    # Selectors must attach .visible to the overlay, not to a descendant.
    css = [row.replace(scope + ' .visible', scope + '.visible') for row in css]
    origin = np.array([153., 86.])
    connectors = []
    original_start = matrix @ [153., 86.] + offset
    original_next = matrix @ [151., 134.] + offset
    original_angle = math.degrees(math.atan2(*(original_next-original_start)[::-1]))
    for pc in frames:
        p, n, neck, beta = geometry(pc)
        heading = p[1] - p[0]
        angle = math.degrees(math.atan2(heading[1], heading[0])) - original_angle
        d = ref(p[0]) - origin
        connectors.append((pc, f'transform:translate({d[0]:.4f}px,{d[1]:.4f}px) rotate({angle:.4f}deg);'))
    # Translation is sampled every percent during the forward push as well.
    poses = []
    for pc in list(range(65)) + [100]:
        _, _, neck, beta = geometry(pc)
        delta = ref(neck) - (origin + rotation(beta) @ (ref(NECK) - origin))
        poses.append((pc, f'opacity:{0 if pc <= 4 else 1};transform:translate({delta[0]:.4f}px,{delta[1]:.4f}px) rotate({beta:.4f}deg);'))
    animation('.visible #sga-device', 'rigidIgelMaleSuccessAdvanceSUCCESS', poses)
    animation('.visible #sga-proximal', 'flexibleIgelMaleSuccessConnector', connectors)
    css = [row.replace(scope + ' .visible', scope + '.visible') for row in css]
    rule('#sga-bulb', f"d:path('{bulb}');")
    # Clip a four-unit stroke to the shell for an exact two-unit inner rim,
    # matching the shaft's (25 - 21) / 2 wall with no external stroke bump.
    rule('#sga-stem', 'stroke:none;')
    rule('#sga-cuff-edge-clip path', f"d:path('{bulb}');")
    edge_style=f'stroke-width:{4/math.hypot(a,b):.4f};stroke-linejoin:round;stroke-linecap:butt;clip-path:url(#sga-cuff-edge-clip);'
    rule('#sga-bulb-outline', f"d:path('{blue_edge}');stroke:var(--igel-spine);{edge_style}")
    rule('#sga-seal', f"d:path('{poly(green)}');fill:var(--igel-cuff-color);fill-opacity:1;stroke:none;")
    rule('#sga-seal-border', f"display:inline;d:path('{green_edge}');stroke:var(--igel-cuff-edge);stroke-width:{2.4/math.hypot(a,b):.4f};stroke-linejoin:round;stroke-linecap:butt;clip-path:url(#sga-cuff-edge-clip);")
    rule('#sga-shell-clip path:first-child', f"d:path('{lumen_clip}');")
    rule('#sga-shell-clip path:last-child', f"d:path('{poly([[-1000,-1000],[235,-1000],[235,1000],[-1000,1000]])}');")
    tip = ref(TIP)
    rule('#sga-tip', f'cx:{tip[0]:.4f}px;cy:{tip[1]:.4f}px;opacity:0;')
    final, _, _, _ = geometry(100)
    flow = anatomy([to_world(q) for q in final]) + ' C' + ' '.join(' '.join(f'{v:.4f}' for v in to_world(q)) for q in channel) + ' C322 280 347 294 380 322 C424 354 467 391 508 406'
    rule('.reference-airway-flow', f"d:path('{flow}');")
    mask = anatomy([to_world(q) for q in green]) + ' Z'
    rule('#sga-seal-flow-mask path', f"d:path('{mask}');fill:black;stroke:none;")

    tongue = re.search('id="lx-male-tongue" d="([^"]+)"', html)[1]
    rule('.visible .ra-tongue', f"animation:none;d:var(--lx-contour-rest,path('{tongue}'));")
    palate = re.search('id="lx-palate" d="([^"]+)"', html)[1]
    rule('.visible [data-airway-part="lx-palate"]', f"animation:none;transform:none;d:path('{palate}');")

    # Let the posterior wall yield a few pixels around the single bend and
    # the fuller mask. The tongue is never part of the deformation.
    paths = {
        'lx-esophagus': 'M278 296 C317 302 346 323 382 348 L493 424 L486 434 C433 401 384 366 341 342 Q305 327 274 318 Z',
        'lx-male-esophagus-outline': 'M278 296 C317 302 346 323 382 348 L493 424 M274 318 Q305 327 341 342 C384 366 433 401 486 434',
        'lx-pharynx': 'M102 218 C92 227 92 245 110 264 C127 283 153 292 177 283 C153 270 137 233 132 188 L185 166 C206 158 223 181 237 203 C252 228 272 251 297 257 C338 263 364 288 400 315 L514 389 L498 416 C441 380 390 345 333 322 C277 315 241 313 203 314 C171 324 143 326 116 315 C90 304 77 285 79 263 C81 243 91 223 102 218 Z',
        'lx-male-pharynx-outline': 'M102 218 C92 227 92 245 110 264 C127 283 153 292 177 283 C153 270 137 233 132 188 M185 166 C206 158 223 181 237 203 C252 228 272 251 282 267 M274 318 C253 316 229 315 203 314 C171 324 143 326 116 315 C90 304 77 285 79 263 C81 243 91 223 102 218'
    }
    # Pressure starts only when the device crosses the resting posterior wall.
    # Use the actual body silhouette, rather than a pre-timed clearance morph.
    rest_floor = np.array([[274.,309.],[253.,300.],[229.,298.],[203.,305.]])
    floor = np.array([bezier(rest_floor,t) for t in np.linspace(0,1,201)])[::-1]
    cuff_points = np.array(front + back)
    def pressure(pc):
        p,n,neck,beta = geometry(pc)
        body = np.vstack([p+n*HALF_WIDTH,p-n*HALF_WIDTH,cuff_points])
        world = (body-NECK) @ rotation(beta).T + neck
        samples = world[(world[:,0]>=203)&(world[:,0]<=274)]
        if not len(samples):return 0.
        return max(0.,float(np.max(samples[:,1]-np.interp(samples[:,0],floor[:,0],floor[:,1]))))
    full_pressure = max(pressure(100),.001)
    wall_frames = list(np.arange(0,64.5,.5)) + [100]
    first = next(pc for pc in wall_frames if pressure(pc)>1e-6)
    low,high = max(0,first-.5),first
    for _ in range(24):
        middle=(low+high)/2
        if pressure(middle)>1e-6:high=middle
        else:low=middle
    contact=round(low,5)
    wall_frames=sorted(set(wall_frames+[contact]))
    for part, end in paths.items():
        start = re.search('id="'+part+'"[^>]* d="([^"]+)"', html)[1]
        start_numbers=np.array([float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',start)])
        end_numbers=np.array([float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',end)])
        rows=[];maximum=0.
        for pc in wall_frames:
            factor=0. if pc<=contact else min(1.,pressure(pc)/full_pressure)
            maximum=max(maximum,factor)
            values=iter(start_numbers+(end_numbers-start_numbers)*maximum)
            d=re.sub(r'-?\d+(?:\.\d+)?',lambda _:f'{next(values):.5f}'.rstrip('0').rstrip('.'),start)
            rows.append((pc,f"d:path('{d}');"))
        animation('.visible [data-airway-part="'+part+'"]', 'igelContact'+part.replace('-', ''),
                  rows)
    css = [row.replace(scope + ' .visible', scope + '.visible') for row in css]
    css.append('@media(prefers-reduced-motion:reduce) {')
    rule('.visible #sga-stem', f"d:path('{body_at(100)}');")
    rule('.visible :is(#sga-lumen,#sga-gastric-channel)', f"d:path('{lumen_at(100)}');")
    rule('.visible #sga-device', poses[-1][1])
    rule('.visible #sga-proximal', connectors[-1][1])
    rule('.visible .ra-tongue', f"d:var(--lx-contour-rest,path('{tongue}'));")
    for part, end in paths.items():
        rule('.visible [data-airway-part="'+part+'"]', f"d:path('{end}');")
    css.append('}')
    css = [row.replace(scope + ' .visible', scope + '.visible') for row in css]
    css.append('/* END ADULT MALE IGEL REFERENCE */')
    file.write_text(source + '\n' + '\n'.join(css) + '\n')
    print(f'Generated i-gel success reference: one bend, rigid mask; posterior wall contact at {contact:.2f}%.')
