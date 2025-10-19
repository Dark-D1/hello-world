/*
 * Canvas hero animation: 攻打月球（~10s）
 * - No external libs, requestAnimationFrame based
 * - Time-based interpolation for consistent duration
 * - Particle systems: thruster, flashes, star dust
 * - Resource preloading with graceful fallbacks
 * - Reduced motion: render static final frame
 */
(function () {
  'use strict';

  const d = document;
  const canvas = d.getElementById('hero-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const overlay = d.getElementById('hero-overlay');
  const titleIntro = d.getElementById('intro-title');
  const titleFinal = d.getElementById('final-title');
  const btnReplay = d.getElementById('replay-btn');
  const btnSound = d.getElementById('sound-btn');
  const btnSkip = d.getElementById('skip-btn');
  const btnCta = d.getElementById('cta-btn');
  const loadingEl = d.getElementById('loading');

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Resources
  const ASSETS = {
    rocket: '/assets/images/rocket.svg',
    moonPng: '/assets/images/moon.png',
    moonSvg: '/assets/images/moon.svg',
    audio: {
      launch: '/assets/audio/launch.mp3',
      blast: '/assets/audio/blast.mp3'
    }
  };

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // clamp DPR for performance
  let W = 0, H = 0, CX = 0, CY = 0;

  function resize() {
    const { clientWidth, clientHeight } = canvas.parentElement || canvas;
    W = clientWidth | 0;
    H = clientHeight | 0;
    CX = W / 2; CY = H / 2;
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Simple loader utilities
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed: ' + src));
      img.src = src;
    });
  }

  function tryLoadMoon() {
    return loadImage(ASSETS.moonPng).catch(() => loadImage(ASSETS.moonSvg));
  }

  // Audio (muted by default). If file missing, we fallback to WebAudio beeps
  let soundEnabled = false;
  btnSound.setAttribute('aria-pressed', 'false');
  let audioLaunch, audioBlast;
  let webAudioCtx = null;
  try {
    audioLaunch = new Audio(ASSETS.audio.launch);
    audioBlast = new Audio(ASSETS.audio.blast);
    audioLaunch.preload = 'auto';
    audioBlast.preload = 'auto';
    audioLaunch.muted = true; audioBlast.muted = true;
  } catch (e) {
    // Ignore, fallback to WebAudio later
  }

  function playBeep(freq = 440, duration = 0.08, volume = 0.05) {
    if (!soundEnabled) return;
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return;
    webAudioCtx = webAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctxA = webAudioCtx;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctxA.destination);
    const now = ctxA.currentTime;
    osc.start(now);
    osc.stop(now + duration);
  }

  function playAudio(aud, fallbackFreq) {
    if (!soundEnabled) return;
    if (aud && typeof aud.play === 'function') {
      aud.currentTime = 0;
      aud.muted = false;
      const p = aud.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => playBeep(fallbackFreq));
      }
    } else {
      playBeep(fallbackFreq);
    }
  }

  // Star field
  const stars = [];
  let starDensityQuality = 1; // dynamically adjusted
  function initStars() {
    stars.length = 0;
    const baseCount = Math.max(60, Math.min(240, Math.floor((W * H) / 7000)));
    const count = Math.floor(baseCount * starDensityQuality);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.3 + Math.random() * 0.7, // depth
        a: 0.5 + Math.random() * 0.5,
        tw: Math.random() * Math.PI * 2
      });
    }
  }
  initStars();

  // Particles
  const thruster = [];
  const flashes = [];
  let thrusterRateBase = 60; // per second (scaled)
  let flashRateBase = 0; // spawned during attack

  function spawnThruster(x, y, dirX, dirY) {
    // Spawn a few per frame based on rate and performance quality
    const n = Math.max(1, Math.floor(2 * starDensityQuality));
    for (let i = 0; i < n; i++) {
      const speed = 50 + Math.random() * 120;
      const jitter = (Math.random() - 0.5) * 0.6;
      const vx = -dirX * speed + jitter * 20;
      const vy = -dirY * speed + jitter * 20;
      thruster.push({
        x, y,
        vx, vy,
        life: 0,
        max: 0.4 + Math.random() * 0.8,
        r: 3 + Math.random() * 5,
        hue: 40 + Math.random() * 30
      });
    }
  }

  function spawnFlash(x, y) {
    flashes.push({ x, y, life: 0, max: 0.5 + Math.random() * 0.5, r: 10 + Math.random() * 30 });
  }

  function updateParticles(dt) {
    for (let i = thruster.length - 1; i >= 0; i--) {
      const p = thruster[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98; p.vy *= 0.98;
      if (p.life > p.max) thruster.splice(i, 1);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life += dt;
      if (f.life > f.max) flashes.splice(i, 1);
    }
  }

  function drawParticles() {
    // Thruster (glow gradients)
    for (let i = 0; i < thruster.length; i++) {
      const p = thruster[i];
      const t = p.life / p.max;
      const alpha = 1 - t;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (1 + t * 2));
      grd.addColorStop(0, `hsla(${p.hue},100%,60%,${0.8 * alpha})`);
      grd.addColorStop(1, `hsla(${p.hue},100%,50%,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + t * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    // Attack flashes
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      const t = f.life / f.max;
      const alpha = 1 - t;
      const r = f.r * (1 + t * 3);
      const grd2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      grd2.addColorStop(0, `rgba(255,255,255,${0.8 * alpha})`);
      grd2.addColorStop(0.5, `rgba(255,200,80,${0.5 * alpha})`);
      grd2.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = grd2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw helpers
  function drawStars(scrollY = 0, zoom = 1) {
    ctx.save();
    ctx.globalAlpha = 1;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const y = (s.y + scrollY * (0.2 + 0.8 * s.z)) % H;
      const tw = Math.sin(s.tw + timeSec * (0.3 + s.z)) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,255,255,${s.a * tw})`;
      ctx.fillRect(s.x, y, 1.2 + s.z * 1.8, 1.2 + s.z * 1.8);
    }
    ctx.restore();
  }

  function drawMoon(x, y, baseR, img) {
    if (img) {
      const r = baseR * 2;
      ctx.drawImage(img, x - r / 2, y - r / 2, r, r);
    } else {
      // Vector fallback
      const r = baseR * 2;
      const grd = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.2, x, y, r * 0.65);
      grd.addColorStop(0, '#f4f6f8');
      grd.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b6c1cd';
      ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.18, y - r * 0.22, r * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.08, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawRocket(x, y, angleRad, img) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    const w = 32, h = 64;
    if (img) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      // Fallback vector rocket
      ctx.fillStyle = '#A1B8FF';
      ctx.strokeStyle = '#6B7FD6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.45);
      ctx.quadraticCurveTo(w * 0.2, -h * 0.2, w * 0.25, 0);
      ctx.lineTo(w * 0.25, h * 0.2);
      ctx.lineTo(-w * 0.25, h * 0.2);
      ctx.lineTo(-w * 0.25, 0);
      ctx.quadraticCurveTo(-w * 0.2, -h * 0.2, 0, -h * 0.45);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath(); ctx.arc(0, -h * 0.05, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Timeline and state
  const DURATION = 10000; // ms
  let startTime = 0;
  let animId = 0;
  let ended = false;
  let timeSec = 0;

  // Loaded assets
  let rocketImg = null; let moonImg = null;

  // Camera/parallax state
  let cameraScroll = 0; // stars scroll

  // FPS adaptive quality
  let emaDt = 16.7; // ms

  function easeInOutSine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function renderFrame(now) {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    const t = clamp(elapsed / DURATION, 0, 1);
    timeSec = elapsed / 1000;

    // FPS tracking for adaptive quality
    const dtMs = Math.max(1, now - (renderFrame._last || now));
    renderFrame._last = now;
    emaDt = emaDt * 0.9 + dtMs * 0.1;
    const fps = 1000 / emaDt;
    if (fps < 45 && starDensityQuality > 0.6) {
      starDensityQuality -= 0.02; initStars();
    } else if (fps > 58 && starDensityQuality < 1.2) {
      starDensityQuality += 0.01; initStars();
    }

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Scene breakdown
    // 0-0.2: Stars + intro fade in
    // 0.2-0.6: Rocket launch upward, moon far
    // 0.6-0.9: Rocket orbit and attack
    // 0.9-1.0: Big glow and freeze

    const s1 = clamp(t / 0.2, 0, 1);
    const s2 = clamp((t - 0.2) / 0.4, 0, 1);
    const s3 = clamp((t - 0.6) / 0.3, 0, 1);
    const s4 = clamp((t - 0.9) / 0.1, 0, 1);

    // star scroll/parallax
    cameraScroll += 20 * (0.2 + s2 + s3) * (emaDt / 1000);
    drawStars(cameraScroll, 1);

    // Moon position and size
    const moonBaseR = Math.min(W, H) * (0.12 + 0.06 * s3 + 0.12 * s4); // grows near end
    const moonX = W * (0.72 - 0.04 * s2 + 0.02 * s3);
    const moonY = H * (0.28 - 0.04 * s2 + 0.02 * s3);

    // Rocket position
    let rocketX, rocketY, rocketAngle = -Math.PI / 2;
    if (s2 > 0 && s3 === 0) {
      // launch straight up from bottom center
      rocketX = CX - W * 0.06 * (1 - s2);
      rocketY = H + 50 - (H * 0.9) * s2;
      rocketAngle = -Math.PI / 2 + (1 - s2) * 0.1;
    } else if (s3 > 0) {
      // orbit around moon
      const orbitR = moonBaseR * 1.2;
      const ang = -Math.PI / 2 + s3 * Math.PI * 1.6; // around moon
      rocketX = moonX + Math.cos(ang) * orbitR;
      rocketY = moonY + Math.sin(ang) * orbitR;
      rocketAngle = ang + Math.PI / 2;
    } else {
      // before launch visible? keep off-screen
      rocketX = CX; rocketY = H + 80; rocketAngle = -Math.PI / 2;
    }

    // Draw moon first (far)
    drawMoon(moonX, moonY, moonBaseR, moonImg);

    // Attack beams during s3 middle
    if (s3 > 0) {
      const pulse = Math.sin(timeSec * 12) * 0.5 + 0.5;
      const beamAlpha = clamp(0.2 + 0.8 * pulse, 0, 1) * s3 * 0.8;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(80,200,255,${beamAlpha})`;
      ctx.lineWidth = 2 + 6 * pulse;
      ctx.beginPath();
      ctx.moveTo(rocketX, rocketY);
      ctx.lineTo(moonX, moonY);
      ctx.stroke();
      ctx.restore();

      // sporadic flashes near moon
      if (Math.random() < 0.25) spawnFlash(moonX + (Math.random() - 0.5) * moonBaseR, moonY + (Math.random() - 0.5) * moonBaseR);
    }

    // Thruster particles when moving
    const dirX = Math.cos(rocketAngle), dirY = Math.sin(rocketAngle);
    if (s2 > 0 || s3 > 0) {
      const rate = thrusterRateBase * starDensityQuality;
      const dt = emaDt / 1000;
      const particlesThisFrame = Math.floor(rate * dt * (1 + s3));
      for (let i = 0; i < particlesThisFrame; i++) {
        const backX = rocketX - dirX * 18 + (Math.random() - 0.5) * 4;
        const backY = rocketY - dirY * 18 + (Math.random() - 0.5) * 4;
        spawnThruster(backX, backY, dirX, dirY);
      }
    }

    // Draw rocket above beams
    drawRocket(rocketX, rocketY, rocketAngle, rocketImg);

    // Final big glow
    if (s4 > 0) {
      const r = moonBaseR * (1 + s4 * 4);
      const g = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, r);
      g.addColorStop(0, `rgba(255,255,255,${0.25 + 0.45 * s4})`);
      g.addColorStop(0.5, `rgba(200,220,255,${0.18 + 0.3 * s4})`);
      g.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = g;
      ctx.globalCompositeOperation = 'screen';
      ctx.beginPath();
      ctx.arc(moonX, moonY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // particles last to overlay
    updateParticles(emaDt / 1000);
    drawParticles();

    // UI fades
    titleIntro.style.opacity = String(easeInOutSine(s1) * (1 - s3));

    if (t >= 1) {
      onEnd();
      return;
    }

    animId = requestAnimationFrame(renderFrame);
  }

  function onEnd() {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(animId);
    // Freeze final frame by drawing once more at t=1 (approx already there)
    overlay.classList.add('is-final');
    titleFinal.setAttribute('aria-hidden', 'false');
    btnSkip.setAttribute('disabled', 'disabled');
    btnReplay.removeAttribute('disabled');
  }

  function restart(playEvenIfReduced = false) {
    thruster.length = 0; flashes.length = 0; ended = false; startTime = 0; cameraScroll = 0; renderFrame._last = 0;
    overlay.classList.remove('is-final');
    titleFinal.setAttribute('aria-hidden', 'true');
    btnSkip.removeAttribute('disabled');
    if (prefersReducedMotion && !playEvenIfReduced) {
      // Render static end frame
      ctx.clearRect(0, 0, W, H);
      drawStars(0, 1);
      const moonBaseR = Math.min(W, H) * 0.24;
      drawMoon(W * 0.7, H * 0.3, moonBaseR, moonImg);
      // glow
      const r = moonBaseR * 3;
      const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W * 0.7, H * 0.3, r, 0, Math.PI * 2); ctx.fill();
      overlay.classList.add('is-final');
      titleFinal.setAttribute('aria-hidden', 'false');
      // Update replay button label to "播放动画"
      btnReplay.textContent = '播放动画';
      btnReplay.setAttribute('aria-label', '播放动画');
    } else {
      btnReplay.textContent = '重新播放';
      btnReplay.setAttribute('aria-label', '重新播放动画');
      animId = requestAnimationFrame(renderFrame);
    }
  }

  // Interactions
  btnReplay.addEventListener('click', () => {
    if (prefersReducedMotion && overlay.classList.contains('is-final')) {
      // Allow user to opt-in to animation even with reduced motion preference
      restart(true);
    } else {
      restart(true);
    }
  });

  btnSkip.addEventListener('click', () => {
    // Skip immediately to end frame
    cancelAnimationFrame(animId);
    onEnd();
  });

  btnSound.addEventListener('click', async () => {
    soundEnabled = !soundEnabled;
    btnSound.textContent = '音效：' + (soundEnabled ? '开' : '关');
    btnSound.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    try {
      if ((window.AudioContext || window.webkitAudioContext) && webAudioCtx && webAudioCtx.state === 'suspended') {
        await webAudioCtx.resume();
      }
    } catch (e) {}
  });

  // Preload images
  let resourcesReady = false;
  (function preload() {
    loadingEl.removeAttribute('aria-hidden');
    Promise.all([
      loadImage(ASSETS.rocket).then(img => { rocketImg = img; }).catch(() => { rocketImg = null; }),
      tryLoadMoon().then(img => { moonImg = img; }).catch(() => { moonImg = null; })
    ]).finally(() => {
      resourcesReady = true;
      loadingEl.setAttribute('aria-hidden', 'true');
    });
  })();

  // Auto play once DOM is ready
  if (prefersReducedMotion) {
    // Render static end frame and keep controls accessible
    restart(false);
  } else {
    // Initial ignition sound is only played if user enables sound later
    restart(true);
  }

  // Timed sound triggers
  let launchPlayed = false;
  let blastPlayed = false;
  const soundTicker = () => {
    if (!soundEnabled) return;
    const now = performance.now();
    const t = (now - (startTime || now)) / DURATION;
    if (t > 0.2 && !launchPlayed) {
      launchPlayed = true; playAudio(audioLaunch, 220);
    }
    if (t > 0.7 && !blastPlayed) {
      blastPlayed = true; playAudio(audioBlast, 660);
    }
  };
  setInterval(soundTicker, 120);
})();
