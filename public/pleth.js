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
      const dropout = Math.floor(warped) % 4 === 2 ? 0.06 : 0.35;
      return dropout * pulse * (0.7 + 0.3 * Math.sin(t * 1.9)) + 0.18 * noise + 0.08 * Math.sin(t * 4.7);
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
    if (!signal || signal.reason === 'unplaced') return 'Probe not placed';
    if (signal.reason === 'disconnected') return 'Probe disconnected';
    if (signal.quality === 'absent') return 'No pulse ox signal';
    if (signal.quality === 'poor') return 'Weak signal · reading unreliable';
    if (!signal.reliable) return 'Signal artifact · reading unreliable';
    return 'Good signal · reading reliable';
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
  return { sample, selection, description, createStrip };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlethWaveform;
