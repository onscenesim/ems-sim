(function () {
  'use strict';
  // Ragged, opaque blocks conceal the face before the loading overlay opens.
  // Nesting them inside the patient carries them with the stretcher and suspension.
  const rows = [[1,6],[0,7],[0,7],[0,7],[1,7],[0,6],[1,6],[2,5]];
  const palette = ['#b7c0bc', '#8e9b97', '#ced2c9', '#5b6e6c', '#a4b1ad'];
  function paint(group, cells, phase) {
    group.dataset.frame = String(phase);
    group.setAttribute('transform', `translate(${phase ? (phase % 3 - 1) * 1.2 : 0} ${phase ? (phase % 2 ? .8 : -.8) : 0})`);
    cells.forEach((cell, i) => {
      const hash = (i * 17 + phase * 7) % 31;
      cell.setAttribute('fill', palette[hash % palette.length]);
      cell.setAttribute('x', String(4 + Number(cell.dataset.col) * 10 + (hash % 3 - 1) * .7));
      cell.setAttribute('width', String(11 + (hash % 4 === 0 ? 1 : 0)));
    });
  }
  document.querySelectorAll('.city-face-mosaic').forEach(group => {
    group.innerHTML = rows.map(([first,last], row) => Array.from({ length: last - first + 1 }, (_, i) =>
      `<rect data-col="${first + i}" x="${4 + (first + i) * 10}" y="${34 + row * 10}" width="11" height="11"/>`
    ).join('')).join('');
    paint(group, [...group.querySelectorAll('rect')], 0);
  });
  window.PatientPrivacy = {
    start(overlay, { held = false } = {}) {
      const mosaic = overlay.querySelector('.city-face-mosaic');
      if (!mosaic) return () => {};
      const cells = [...mosaic.querySelectorAll('rect')];
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const started = performance.now();
      let frame, stopped = false, previous = -1;
      const update = () => {
        if (stopped) return;
        if (!document.hidden) {
          const phase = reduced ? 0 : 1 + Math.floor((performance.now() - started) / (held ? 180 : 85)) % 997;
          if (phase !== previous) { paint(mosaic, cells, phase); previous = phase; }
        }
        if (!reduced) frame = requestAnimationFrame(update);
      };
      update();
      return () => { stopped = true; cancelAnimationFrame(frame); };
    },
  };
})();
