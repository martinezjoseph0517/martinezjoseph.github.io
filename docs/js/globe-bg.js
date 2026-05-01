/* Maritime hero background: orthographic globe + animated shipping lanes.
 * Requires d3 v7 (loaded via include-in-header in index.qmd). */
(() => {
  if (typeof d3 === 'undefined') return;
  const canvas = document.getElementById('globe-bg');
  if (!canvas) return;

  // Respect users who asked for reduced motion.
  if (window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Major shipping lanes: [lon, lat], with a relative traffic weight.
  const LANES = [
    { id: 'shanghai-la',   a: [121.47,  31.23], b: [-118.24,  33.75], w: 1.00 },
    { id: 'singapore-suez',a: [103.82,   1.35], b: [  32.55,  30.05], w: 0.90 },
    { id: 'suez-rotterdam',a: [ 32.55,  30.05], b: [   4.48,  51.92], w: 0.90 },
    { id: 'hk-la',         a: [114.16,  22.32], b: [-118.24,  33.75], w: 0.70 },
    { id: 'rotterdam-nyc', a: [  4.48,  51.92], b: [ -74.01,  40.71], w: 0.80 },
    { id: 'dubai-mumbai',  a: [ 55.27,  25.20], b: [  72.88,  19.08], w: 0.55 },
    { id: 'santos-shanghai',a:[-46.63, -23.55], b: [ 121.47,  31.23], w: 0.60 },
    { id: 'panama-nyc',    a: [-79.52,   8.97], b: [ -74.01,  40.71], w: 0.60 },
    { id: 'tokyo-sf',      a: [139.69,  35.69], b: [-122.42,  37.77], w: 0.70 },
    { id: 'busan-la',      a: [126.98,  37.57], b: [-118.24,  33.75], w: 0.70 },
    { id: 'mumbai-suez',   a: [ 72.88,  19.08], b: [  32.55,  30.05], w: 0.55 },
    { id: 'singapore-sydney',a:[103.82,  1.35], b: [ 151.21, -33.86], w: 0.45 },
    { id: 'durban-singapore',a:[ 31.04,-29.86], b: [ 103.82,   1.35], w: 0.50 },
    { id: 'hamburg-nyc',   a: [  9.99,  53.55], b: [ -74.01,  40.71], w: 0.65 },
    { id: 'shanghai-singapore',a:[121.47,31.23],b: [ 103.82,   1.35], w: 0.85 },
  ];

  const projection = d3.geoOrthographic().clipAngle(90);
  const sphere     = { type: 'Sphere' };
  const graticule  = d3.geoGraticule10();
  const path       = d3.geoPath(projection, ctx);

  let W = 0, H = 0;
  let particles = [];
  let running = true;
  let staticDirty = true;          // redraw the static layer when the size changes
  const offscreen = document.createElement('canvas');
  const octx = offscreen.getContext('2d');

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = canvas.width  = Math.max(1, Math.floor(r.width  * dpr));
    H = canvas.height = Math.max(1, Math.floor(r.height * dpr));
    canvas.style.width  = r.width  + 'px';
    canvas.style.height = r.height + 'px';
    offscreen.width  = W;
    offscreen.height = H;

    const scale = Math.min(W, H) * 0.48;
    projection
      .scale(scale)
      .translate([W / 2, H / 2])
      .rotate([-20, -15]);

    staticDirty = true;
  }

  // Pre-build great-circle interpolators per lane.
  LANES.forEach(L => { L.interp = d3.geoInterpolate(L.a, L.b); });

  function drawStaticLayer() {
    const g = octx;
    g.fillStyle = '#000409';
    g.fillRect(0, 0, W, H);

    // Re-bind d3.geoPath to the offscreen context for one-off drawing.
    const opath = d3.geoPath(projection, g);

    // Globe disk
    g.beginPath(); opath(sphere);
    g.fillStyle = '#02060d';
    g.fill();
    g.lineWidth = 1 * dpr;
    g.strokeStyle = 'rgba(70,110,160,0.22)';
    g.stroke();

    // Graticule (latitude/longitude lines)
    g.beginPath(); opath(graticule);
    g.strokeStyle = 'rgba(70,110,160,0.07)';
    g.lineWidth = 0.6 * dpr;
    g.stroke();

    // Lane arcs (faint great-circle paths)
    g.lineWidth = 0.8 * dpr;
    LANES.forEach(L => {
      g.beginPath();
      opath({ type: 'LineString', coordinates: [L.a, L.b] });
      g.strokeStyle = `rgba(120,170,230,${0.05 + 0.10 * L.w})`;
      g.stroke();
    });
  }

  function spawn() {
    LANES.forEach(L => {
      // Spawn rate scales with traffic weight.
      if (Math.random() < 0.020 * L.w) {
        particles.push({
          L,
          t: 0,
          speed: 0.0008 + Math.random() * 0.0014,
          life: Math.random() * 100,
          intensity: 0.65 + Math.random() * 0.35,
        });
      }
    });
  }

  function frame() {
    if (!running) return;

    if (staticDirty) {
      drawStaticLayer();
      staticDirty = false;
    }

    // Trail effect: fade previous frame, then composite the static layer.
    ctx.fillStyle = 'rgba(0, 4, 10, 0.22)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(offscreen, 0, 0);
    ctx.globalAlpha = 1;

    // Update + draw particles
    spawn();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += p.speed;
      p.life += 1;
      if (p.t >= 1) { particles.splice(i, 1); continue; }

      const lonlat = p.L.interp(p.t);
      const xy = projection(lonlat);
      if (!xy) continue;             // back side of globe is auto-clipped

      const pulse = 0.75 + 0.25 * Math.sin(p.life * 0.13);
      const a = p.intensity * pulse;
      const r = (1.1 + 1.5 * p.L.w) * dpr;

      // Soft glow
      const grd = ctx.createRadialGradient(xy[0], xy[1], 0, xy[0], xy[1], r * 4.5);
      grd.addColorStop(0, `rgba(220,240,255,${a})`);
      grd.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r * 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a + 0.2)})`;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slow rotation for the "live globe" feel — invalidates the static layer.
    const rot = projection.rotate();
    projection.rotate([rot[0] + 0.04, rot[1]]);
    staticDirty = true;

    requestAnimationFrame(frame);
  }

  // Pause when off-screen or tab hidden.
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const wasRunning = running;
      running = e.isIntersecting && !document.hidden;
      if (running && !wasRunning) requestAnimationFrame(frame);
    });
  });
  io.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    const wasRunning = running;
    running = !document.hidden;
    if (running && !wasRunning) requestAnimationFrame(frame);
  });

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
