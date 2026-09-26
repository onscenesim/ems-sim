"""Generate original procedural Foley, mono PCM with smooth attack/release.
No external recordings or packages. Intubation.mp3 is the user-provided clip.
"""
import math, random, struct, wave
from pathlib import Path
RATE = 24000
OUT = Path(__file__).resolve().parents[1] / 'public' / 'sounds'

def render(name, duration, kind):
    rng = random.Random(name)
    low = mid = phase = 0.0
    samples = []
    for i in range(round(duration * RATE)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low += .045 * (noise - low)
        mid += .34 * (noise - mid)
        if kind == 'oxygen':
            # Soft, steady turbulent gas flow; no high-pitched whistle.
            value = .6 * (mid - low) * (1 + .06 * math.sin(t * 17))
        elif kind == 'suction':
            # Motor bed, interrupted airflow, and low wet gurgling.
            pulse = (.5 + .5 * math.sin(2 * math.pi * (5*t + .2*math.sin(t*8)))) ** 3
            phase += 2 * math.pi * (125 + 60 * pulse) / RATE
            value = .42 * (mid-low) * (.4 + pulse) + .16 * math.sin(phase) * pulse + .035 * math.sin(2*math.pi*83*t)
        else:
            # Repeated damp compression/squelch, matched to packing/tightening.
            pulse = (.5 + .5 * math.sin(2*math.pi*2.3*t - math.pi/2)) ** 2
            phase += 2 * math.pi * (95 + 145*pulse) / RATE
            value = pulse * (.65*low + .12*math.sin(phase) + .14*(mid-low))
        fade = min(1, t/.07, (duration-t)/.1)
        samples.append(value * max(0, fade))
    peak = max(abs(x) for x in samples)
    gain = .55 / peak
    with wave.open(str(OUT / name), 'wb') as output:
        output.setparams((1,2,RATE,0,'NONE','not compressed'))
        output.writeframes(struct.pack('<%dh' % len(samples), *(round(x*gain*32767) for x in samples)))
    rms = math.sqrt(sum((x*gain)**2 for x in samples)/len(samples))
    print(f'{name}: {duration:.2f}s, peak -5.2 dBFS, RMS {20*math.log10(rms):.1f} dBFS')

render('Suction.wav', 2.78, 'suction')
render('OxygenFlow.wav', 1.8, 'oxygen')
render('WoundCompression.wav', 3.0, 'squelch')
