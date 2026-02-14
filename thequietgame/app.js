/* ============================================
   THE QUIET GAME — App v2
   Accurate timer · frequency viz · progress border
   ============================================ */
(() => {
  'use strict';

  /* ---------- constants ---------- */
  const DEFAULT_THRESHOLD = 0.035;
  const DEBOUNCE_MS       = 200;
  const CAL_DURATION      = 2000;
  const CAL_MARGIN        = 1.30;
  const FFT_SIZE          = 256;      // gives 128 frequency bins

  /* ---------- state ---------- */
  let gameState        = 'idle';      // idle | running | paused | win | lose
  let selectedDuration = 900;         // seconds
  let threshold        = DEFAULT_THRESHOLD;

  // Timing — timestamp-based for accuracy
  let durationMs       = 0;           // total game length in ms
  let startedAt        = 0;           // performance.now() when started / resumed
  let elapsedBeforePause = 0;         // ms accumulated before current run segment
  let remainingMs      = 0;           // computed each frame

  let peakLevel        = 0;
  let currentLevel     = 0;
  let aboveThresholdAt = null;        // timestamp when level first exceeded threshold

  // Audio graph
  let audioCtx   = null;
  let analyser   = null;
  let micStream  = null;
  let sourceNode = null;

  // Render
  let rafId    = null;
  let canvas, ctx;

  // Wake lock
  let wakeLock = null;

  /* ---------- DOM ---------- */
  const $ = s => document.querySelector(s);

  const screens = {
    idle:    $('#screen-idle'),
    running: $('#screen-running'),
    win:     $('#screen-win'),
    lose:    $('#screen-lose'),
  };

  const el = {
    timerText:        $('#timer-text'),
    vizLevel:         $('#viz-level'),
    statPeak:         $('#stat-peak'),
    statThreshold:    $('#stat-threshold'),
    slider:           $('#threshold-slider'),
    sliderDisp:       $('#threshold-display'),
    calStatus:        $('#calibrate-status'),
    micError:         $('#mic-error'),
    micErrorMsg:      $('#mic-error-msg'),
    infoModal:        $('#info-modal'),
    btnStart:         $('#btn-start'),
    btnCalibrate:     $('#btn-calibrate'),
    btnResetTh:       $('#btn-reset-threshold'),
    btnPause:         $('#btn-pause'),
    btnStop:          $('#btn-stop'),
    btnAgainWin:      $('#btn-again-win'),
    btnAgainLose:     $('#btn-again-lose'),
    btnDismissErr:    $('#btn-dismiss-error'),
    btnInfo:          $('#btn-info'),
    btnCloseInfo:     $('#btn-close-info'),
    btnCloseInfo2:    $('#btn-close-info-bottom'),
    vizCanvas:        $('#viz-canvas'),
    progressBorder:   $('#progress-border'),
    progressRect:     $('#progress-rect'),
    runningHint:      $('#running-hint'),
    // result fields
    winDuration:  $('#win-duration'),
    winMaxLevel:  $('#win-max-level'),
    winThreshold: $('#win-threshold'),
    loseTimeLeft: $('#lose-time-left'),
    losePeak:     $('#lose-peak'),
    loseThreshold:$('#lose-threshold'),
  };

  /* ---------- helpers ---------- */
  function fmtTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const h  = Math.floor(totalSec / 3600);
    const m  = Math.floor((totalSec % 3600) / 60);
    const s  = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function fmtTimeSec(sec) { return fmtTime(sec * 1000); }
  function fmtLvl(v) { return v.toFixed(3); }

  function showScreen(name) {
    Object.keys(screens).forEach(k => screens[k].classList.toggle('active', k === name));
    const focusTarget = screens[name].querySelector('button, [tabindex]');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 120);
  }

  /* ---------- progress border ---------- */
  function sizeProgressRect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = el.progressRect;
    r.setAttribute('width',  w - 6);
    r.setAttribute('height', h - 6);
    // perimeter
    const perim = 2 * (w - 6) + 2 * (h - 6);
    r.style.strokeDasharray  = perim;
    r.style.strokeDashoffset = 0;
    r.dataset.perim = perim;
  }

  function updateProgressBorder(fraction) {
    // fraction: 0 = just started (full border), 1 = time's up (no border)
    const perim = parseFloat(el.progressRect.dataset.perim) || 0;
    el.progressRect.style.strokeDashoffset = perim * fraction;
  }

  /* ---------- wake lock ---------- */
  async function acquireWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gameState === 'running') acquireWakeLock();
  });

  /* ---------- duration selection ---------- */
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.duration-btn').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
      selectedDuration = parseInt(btn.dataset.seconds, 10);
    });
  });

  /* ---------- threshold slider ---------- */
  el.slider.addEventListener('input', () => {
    threshold = parseFloat(el.slider.value);
    el.sliderDisp.textContent = fmtLvl(threshold);
  });
  el.btnResetTh.addEventListener('click', () => {
    threshold = DEFAULT_THRESHOLD;
    el.slider.value = threshold;
    el.sliderDisp.textContent = fmtLvl(threshold);
  });

  /* ---------- calibration ---------- */
  el.btnCalibrate.addEventListener('click', async () => {
    el.btnCalibrate.classList.add('calibrating');
    el.calStatus.textContent = 'Listening\u2026';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      const c = new (window.AudioContext || window.webkitAudioContext)();
      if (c.state === 'suspended') await c.resume();
      const src = c.createMediaStreamSource(s);
      const an  = c.createAnalyser();
      an.fftSize = FFT_SIZE;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let maxRms = 0, sumRms = 0, n = 0;
      const t0 = performance.now();
      (function loop() {
        if (performance.now() - t0 > CAL_DURATION) {
          const avg = sumRms / Math.max(n, 1);
          const cal = Math.max(avg, maxRms) * CAL_MARGIN;
          threshold = Math.round(Math.max(0.005, Math.min(0.15, cal)) * 1000) / 1000;
          el.slider.value = threshold;
          el.sliderDisp.textContent = fmtLvl(threshold);
          el.calStatus.textContent = 'Done \u2192 ' + fmtLvl(threshold);
          src.disconnect(); c.close().catch(() => {}); s.getTracks().forEach(t => t.stop());
          el.btnCalibrate.classList.remove('calibrating');
          return;
        }
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms > maxRms) maxRms = rms;
        sumRms += rms; n++;
        requestAnimationFrame(loop);
      })();
    } catch (_) {
      el.btnCalibrate.classList.remove('calibrating');
      el.calStatus.textContent = 'Mic access failed.';
    }
  });

  /* ---------- audio init / teardown ---------- */
  async function initAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    micStream  = stream;
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    analyser   = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.4;
    sourceNode.connect(analyser);
  }

  function teardownAudio() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    analyser = null;
  }

  /* ---------- canvas ---------- */
  function initCanvas() {
    canvas = el.vizCanvas;
    ctx    = canvas.getContext('2d');
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const box = canvas.parentElement;
    const sz  = Math.min(box.clientWidth, box.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = sz * dpr;
    canvas.height = sz * dpr;
    canvas.style.width  = sz + 'px';
    canvas.style.height = sz + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- visualization ---------- */
  // Smooth frequency data for prettier bars
  let smoothFreq = null;

  function drawViz(rms, freqData, byteTimeDomain) {
    if (!ctx) return;
    const w  = canvas.clientWidth;
    const h  = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const R  = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    /* ---- Threshold ring ---- */
    const thR = R * Math.min(threshold / 0.12, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, thR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.13)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    /* ---- Frequency spectrum (circular bars) ---- */
    if (freqData) {
      const bins = freqData.length;           // FFT_SIZE/2 = 128
      const useBins = Math.floor(bins * 0.75); // skip highest freqs (mostly silence)
      const barCount = useBins;

      // smooth
      if (!smoothFreq || smoothFreq.length !== barCount) {
        smoothFreq = new Float32Array(barCount);
      }

      const baseR    = R * 0.38;
      const maxBarH  = R * 0.52;

      for (let i = 0; i < barCount; i++) {
        const raw = freqData[i] / 255;
        smoothFreq[i] += (raw - smoothFreq[i]) * 0.35; // smoothing
        const val = smoothFreq[i];

        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const barH  = val * maxBarH;
        const x1 = cx + Math.cos(angle) * baseR;
        const y1 = cy + Math.sin(angle) * baseR;
        const x2 = cx + Math.cos(angle) * (baseR + barH);
        const y2 = cy + Math.sin(angle) * (baseR + barH);

        // Color: gold at normal, amber near threshold, red above
        let alpha = 0.25 + val * 0.65;
        let r, g, b;
        if (rms >= threshold) {
          const t = Math.min((rms - threshold) / threshold, 1);
          r = 240; g = Math.round(84 + (1 - t) * 80); b = Math.round(74 + (1 - t) * 50);
          alpha = 0.4 + val * 0.6;
        } else if (val > 0.4) {
          r = 220; g = 180; b = 80;
        } else {
          r = 180; g = 165; b = 110;
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * baseR) / barCount * 0.55);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    /* ---- Inner waveform ring ---- */
    if (byteTimeDomain && byteTimeDomain.length > 0) {
      const waveR   = R * 0.32;
      const waveAmp = R * 0.08;
      const len     = byteTimeDomain.length;

      ctx.beginPath();
      for (let i = 0; i <= len; i++) {
        const idx   = i % len;
        const angle = (idx / len) * Math.PI * 2 - Math.PI / 2;
        const v     = byteTimeDomain[idx] / 128.0;
        const r     = waveR + (v - 1.0) * waveAmp;
        const x     = cx + Math.cos(angle) * r;
        const y     = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rms >= threshold
        ? 'rgba(240, 84, 74, 0.35)'
        : 'rgba(201, 168, 76, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* ---- Central glow ---- */
    const glowR = R * Math.min(rms / 0.08, 1) * 0.7;
    if (glowR > 2) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      if (rms >= threshold) {
        g.addColorStop(0, 'rgba(240, 84, 74, 0.18)');
        g.addColorStop(1, 'rgba(240, 84, 74, 0)');
      } else {
        g.addColorStop(0, 'rgba(201, 168, 76, 0.09)');
        g.addColorStop(1, 'rgba(201, 168, 76, 0)');
      }
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    /* ---- Center dot ---- */
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = rms >= threshold ? 'rgba(240,84,74,0.7)' : 'rgba(201,168,76,0.35)';
    ctx.fill();
  }

  /* ---------- main loop ---------- */
  function tick(now) {
    if (gameState !== 'running' && gameState !== 'paused') return;

    if (gameState === 'running') {
      /* --- accurate time --- */
      const elapsed = elapsedBeforePause + (now - startedAt);
      remainingMs   = Math.max(0, durationMs - elapsed);

      el.timerText.textContent = fmtTime(remainingMs);

      /* --- progress border --- */
      const fraction = 1 - (remainingMs / durationMs); // 0→1
      updateProgressBorder(fraction);

      // Danger color when < 15% remaining
      el.progressBorder.classList.toggle('danger', remainingMs / durationMs < 0.15);

      /* --- audio analysis --- */
      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyser.fftSize);
        const floatData = new Float32Array(analyser.fftSize);

        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);
        analyser.getFloatTimeDomainData(floatData);

        // RMS from float time-domain
        let sum = 0;
        for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
        currentLevel = Math.sqrt(sum / floatData.length);
        if (currentLevel > peakLevel) peakLevel = currentLevel;

        // Update readouts
        el.vizLevel.textContent  = fmtLvl(currentLevel);
        el.statPeak.textContent  = fmtLvl(peakLevel);

        // Color the level
        if (currentLevel >= threshold)          el.vizLevel.style.color = '#f0544a';
        else if (currentLevel >= threshold * 0.7) el.vizLevel.style.color = '#e8a840';
        else                                     el.vizLevel.style.color = '';

        // Debounced threshold check
        if (currentLevel >= threshold) {
          if (aboveThresholdAt === null) aboveThresholdAt = now;
          else if (now - aboveThresholdAt >= DEBOUNCE_MS) { endGame('lose'); return; }
        } else {
          aboveThresholdAt = null;
        }

        drawViz(currentLevel, freqData, timeData);
      }

      /* --- win check --- */
      if (remainingMs <= 0) { endGame('win'); return; }
    } else {
      // paused — still draw but static
      drawViz(currentLevel, null, null);
    }

    rafId = requestAnimationFrame(tick);
  }

  /* ---------- game control ---------- */
  async function startGame() {
    peakLevel        = 0;
    currentLevel     = 0;
    aboveThresholdAt = null;
    durationMs       = selectedDuration * 1000;
    elapsedBeforePause = 0;
    remainingMs      = durationMs;
    smoothFreq       = null;

    el.statThreshold.textContent = fmtLvl(threshold);

    try {
      await initAudio();
    } catch (err) {
      let msg = 'This game needs microphone access to detect sound.';
      if (err.name === 'NotAllowedError')  msg = 'Microphone permission was denied. Please allow access and try again.';
      else if (err.name === 'NotFoundError')  msg = 'No microphone found. Please connect one and try again.';
      else if (err.name === 'NotReadableError') msg = 'Microphone is in use by another app.';
      el.micErrorMsg.textContent = msg;
      el.micError.hidden = false;
      return;
    }

    gameState = 'running';
    startedAt = performance.now();

    initCanvas();
    sizeProgressRect();
    el.progressBorder.classList.add('visible');
    el.progressBorder.classList.remove('danger');

    showScreen('running');
    el.btnPause.textContent = 'Pause';
    screens.running.classList.remove('paused-state');

    acquireWakeLock();
    rafId = requestAnimationFrame(tick);
  }

  function endGame(result) {
    gameState = result;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    teardownAudio();
    releaseWakeLock();
    el.progressBorder.classList.remove('visible', 'danger');

    if (result === 'win') {
      el.winDuration.textContent  = fmtTimeSec(selectedDuration);
      el.winMaxLevel.textContent  = fmtLvl(peakLevel);
      el.winThreshold.textContent = fmtLvl(threshold);
      showScreen('win');
    } else {
      el.loseTimeLeft.textContent  = fmtTime(remainingMs);
      el.losePeak.textContent      = fmtLvl(peakLevel);
      el.loseThreshold.textContent = fmtLvl(threshold);
      showScreen('lose');
    }
  }

  function stopGame() {
    gameState = 'idle';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    teardownAudio();
    releaseWakeLock();
    el.progressBorder.classList.remove('visible', 'danger');
    showScreen('idle');
  }

  function togglePause() {
    if (gameState === 'running') {
      // Pause: accumulate elapsed so far
      elapsedBeforePause += performance.now() - startedAt;
      gameState = 'paused';
      el.btnPause.textContent = 'Resume';
      screens.running.classList.add('paused-state');
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else if (gameState === 'paused') {
      gameState = 'running';
      startedAt = performance.now(); // reset segment start
      aboveThresholdAt = null;
      el.btnPause.textContent = 'Pause';
      screens.running.classList.remove('paused-state');
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
  }

  /* ---------- info modal ---------- */
  function openInfo()  { el.infoModal.hidden = false; }
  function closeInfo() { el.infoModal.hidden = true; }

  el.btnInfo.addEventListener('click', openInfo);
  el.btnCloseInfo.addEventListener('click', closeInfo);
  el.btnCloseInfo2.addEventListener('click', closeInfo);
  el.infoModal.addEventListener('click', e => { if (e.target === el.infoModal) closeInfo(); });

  /* ---------- event bindings ---------- */
  el.btnStart.addEventListener('click', startGame);
  el.btnPause.addEventListener('click', togglePause);
  el.btnStop.addEventListener('click', stopGame);
  el.btnAgainWin.addEventListener('click', () => { gameState = 'idle'; showScreen('idle'); });
  el.btnAgainLose.addEventListener('click', () => { gameState = 'idle'; showScreen('idle'); });
  el.btnDismissErr.addEventListener('click', () => { el.micError.hidden = true; });

  /* ---------- resize handling ---------- */
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (gameState === 'running' || gameState === 'paused') {
        resizeCanvas();
        sizeProgressRect();
      }
    }, 120);
  });

  /* ---------- init ---------- */
  showScreen('idle');
})();
