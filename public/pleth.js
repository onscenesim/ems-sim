'use strict';

// Independent from ECG morphology and beat scheduling. Pure samples make the
// training artifacts repeatable across redraws and test runs.
const PlethWaveform = (() => {
  function sample(t, signal) {
    if (!signal || signal.quality === 'absent') return 0;
    const poor = signal.quality === 'poor';
    const unreliable = signal.quality === 'unreliable';
    const rate = Math.max(15, Math.min(300, signal.pulseRate || 75));
    const warped = t * rate / 60 + (poor || unreliable ? 0.11 * Math.sin(t * 2.7) : 0);
    const phase = ((warped % 1) + 1) % 1;
    // Rounded systolic upstroke, slower decay, dicrotic notch and small rebound.
    let pulse = phase < 0.18 ? (1 - Math.cos(Math.PI * phase / 0.18)) / 2
      : (Math.exp(-(phase - 0.18) * 4.5) - Math.exp(-0.82 * 4.5)) / (1 - Math.exp(-0.82 * 4.5));
    pulse -= 0.13 * Math.exp(-(((phase - 0.43) / 0.035) ** 2));
    pulse += 0.08 * Math.exp(-(((phase - 0.51) / 0.05) ** 2));
    const noise = 0.55 * Math.sin(t * 37.1) + 0.3 * Math.sin(t * 61.7 + 0.8) + 0.15 * Math.sin(t * 93.3);
    if (unreliable) {
      // Motion dominates completely: no trustworthy pulse cadence remains.
      // Seeded, interpolated noise avoids both repeating ECG-like complexes
      // and frame-rate-dependent randomness when the strip is redrawn.
      const hash = n => {
        const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return (v - Math.floor(v)) * 2 - 1;
      };
      const drift = frequency => {
        const position = t * frequency, i = Math.floor(position), f = position - i;
        const blend = f * f * (3 - 2 * f);
        return hash(i) * (1 - blend) + hash(i + 1) * blend;
      };
      const block = Math.floor(t / 2.3), within = t / 2.3 - block;
      const dropout = hash(block + 71) > 0.1 && within > 0.62 && within < 0.84;
      if (dropout) return 0.02 * noise;
      const spike = Math.max(0, drift(5.3)) ** 5;
      return Math.max(-0.18, Math.min(1.02,
        0.24 + 0.34 * drift(0.73) + 0.38 * drift(8.7) + 0.16 * noise + 0.55 * spike));
    }
    if (poor) return 0.23 * pulse * (0.65 + 0.35 * Math.sin(t * 1.3) ** 2) + 0.055 * noise;
    return 0.88 * pulse;
  }

  function selection(value) {
    const selected = value === 'pleth' ? 'pleth' : 'ecg';
    return {
      selected, pressed: String(selected === 'pleth'),
      label: selected === 'pleth' ? 'Show ECG waveform' : 'Show SpO₂ pleth waveform',
      text: selected === 'pleth' ? 'PLETH ⇄' : 'ECG ⇄',
    };
  }

  function description(signal) {
    if (!signal || signal.reason === 'unplaced') return '';
    if (signal.quality === 'absent') return 'check probe';
    if (signal.quality === 'unreliable') return 'searching for pulse';
    return '';
  }

  // Synthetic PI for the simulator's signal tiers, not a calibrated clinical
  // measurement. Slow seeded variation stays within the waveform's PI band.
  function perfusionIndex(signal, seconds = 0) {
    if (!signal || signal.quality === 'absent' || signal.reason === 'unplaced') return null;
    const seed = (signal.pulseRate || 75) * 0.137;
    const hash = n => { const x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); };
    const position = seconds / 3, step = Math.floor(position), fraction = position - step;
    const blend = fraction * fraction * (3 - 2 * fraction);
    const variation = hash(step) * (1 - blend) + hash(step + 1) * blend;
    if (signal.quality === 'unreliable' && hash(step + 91) < 0.28) return null;
    const [min, max] = signal.quality === 'good' ? [1.1, 5.5]
      : signal.quality === 'poor' ? [0.3, 1.0] : [0.05, 0.29];
    return Math.round((min + (max - min) * variation) * 100) / 100;
  }

  function createReadout({ pi, status, detail }) {
    let signal = null, timer = null;
    function render() {
      const value = perfusionIndex(signal, performance.now() / 1000);
      const text = `PI ${value === null ? '—' : value.toFixed(2)}`;
      const message = description(signal);
      pi.textContent = text;
      pi.dataset.low = String(value !== null ? value <= 1.0 : signal?.quality === 'unreliable');
      pi.setAttribute('aria-label', `Perfusion index ${value === null ? 'unavailable' : value.toFixed(2)}`);
      status.textContent = message;
      if (detail) detail.textContent = [text, message].filter(Boolean).join(' · ');
    }
    function update(next) {
      signal = next;
      render();
      if (signal && signal.quality !== 'absent') {
        if (timer === null) timer = setInterval(render, 1500);
      } else if (timer !== null) { clearInterval(timer); timer = null; }
    }
    return { update, dispose() { if (timer !== null) clearInterval(timer); timer = null; } };
  }

  function createStrip(canvas) {
    const ctx = canvas?.getContext('2d');
    let signal = null, raf = null, lastTs = null, clock = 0, x = 0, penY = null;
    let width = 0, height = 0, dpr = 1;
    const speed = 46, gap = 12; // same monitor sweep convention as ECG
    function size() {
      if (!canvas || !ctx) return false;
      width = canvas.clientWidth; height = canvas.clientHeight;
      dpr = window.devicePixelRatio || 1;
      if (!width || !height) return false;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        x = 0; penY = null;
      }
      return true;
    }
    function idle() {
      if (!size()) return;
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(74,184,255,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(2, height * 0.82); ctx.lineTo(width - 2, height * 0.82); ctx.stroke();
      ctx.restore();
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!size()) { lastTs = null; return; }
      if (lastTs === null) lastTs = ts;
      const dt = Math.min(0.25, (ts - lastTs) / 1000); lastTs = ts;
      if (dt <= 0) return;
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#4ab8ff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const baseline = height * 0.82, amplitude = height * 0.7;
      const target = x + speed * dt;
      let prev = x;
      ctx.beginPath(); ctx.moveTo(x, penY ?? baseline);
      for (let next = x + 0.75; ; next += 0.75) {
        next = Math.min(next, target);
        const drawX = next % width;
        const y = baseline - amplitude * sample(clock + (next - x) / speed, signal);
        if (drawX < prev) ctx.moveTo(drawX, y); else ctx.lineTo(drawX, y);
        prev = drawX; penY = y;
        if (next >= target) break;
      }
      ctx.stroke();
      const gapX = target % width;
      ctx.clearRect(gapX + 1, 0, gap, height);
      if (gapX + gap + 1 > width) ctx.clearRect(0, 0, gapX + gap + 1 - width, height);
      ctx.restore(); clock += dt; x = target % width;
    }
    function update(next) {
      // Saturation and probe metadata do not affect morphology or restart the
      // sweep. Only quality and peripheral rate drive this independent trace.
      const shape = next ? { quality: next.quality, pulseRate: next.pulseRate } : null;
      if (JSON.stringify(shape) === JSON.stringify(signal)) { if (raf === null) idle(); return; }
      signal = shape;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null; lastTs = null; clock = 0; x = 0; penY = null;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (signal && signal.quality !== 'absent') raf = requestAnimationFrame(frame);
      else idle();
    }
    return { update, resize: () => { if (raf === null) idle(); } };
  }
  return { sample, selection, description, perfusionIndex, createReadout, createStrip };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlethWaveform;
