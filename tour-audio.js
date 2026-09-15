(function(){
  'use strict';

  if (!window.speechSynthesis || window.__tourFixedAudioInstalled) return;
  window.__tourFixedAudioInstalled = true;

  /* ============================================================
     NUMERO SUPPORT TOUR — FIXED AUDIO + MASTER PLAYER
     - Fixed MP3 narration remains the source of truth.
     - START TOUR gate on the first door page.
     - Master mute + volume.
     - Master pause/play through each page's native pause control.
     - Back ~15 seconds, snapped to the beginning of the sentence
       that contains the 15-second target. Replay is visual + audio.
     ============================================================ */

  var synth = window.speechSynthesis;
  var original = {
    speak: synth.speak.bind(synth),
    cancel: synth.cancel.bind(synth),
    pause: synth.pause.bind(synth),
    resume: synth.resume.bind(synth)
  };

  var nativeSetTimeout = window.setTimeout.bind(window);
  var nativeClearTimeout = window.clearTimeout.bind(window);
  var nativeSetInterval = window.setInterval.bind(window);
  var nativeClearInterval = window.clearInterval.bind(window);

  /* ---------- FIRST-PAGE START GATE ---------- */
  var fileName = (window.location.pathname.split('/').pop() || '').toLowerCase();
  var isDoorPage = !fileName || fileName === 'index.html';
  var startGateActive = isDoorPage;
  var gatedTimeouts = new Map();
  var gatedIntervals = new Map();
  var syntheticTimerId = -1;

  function nextSyntheticId(){ return syntheticTimerId--; }

  if (startGateActive) {
    window.setTimeout = function(callback, delay){
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nextSyntheticId();
      gatedTimeouts.set(id, {
        callback: callback,
        delay: Math.max(0, Number(delay) || 0),
        args: args,
        realId: null,
        cleared: false
      });
      return id;
    };

    window.clearTimeout = function(id){
      if (gatedTimeouts.has(id)) {
        var rec = gatedTimeouts.get(id);
        rec.cleared = true;
        if (rec.realId !== null) nativeClearTimeout(rec.realId);
        gatedTimeouts.delete(id);
        return;
      }
      nativeClearTimeout(id);
    };

    window.setInterval = function(callback, delay){
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nextSyntheticId();
      gatedIntervals.set(id, {
        callback: callback,
        delay: Math.max(0, Number(delay) || 0),
        args: args,
        realId: null,
        cleared: false
      });
      return id;
    };

    window.clearInterval = function(id){
      if (gatedIntervals.has(id)) {
        var rec = gatedIntervals.get(id);
        rec.cleared = true;
        if (rec.realId !== null) nativeClearInterval(rec.realId);
        gatedIntervals.delete(id);
        return;
      }
      nativeClearInterval(id);
    };
  }

  function releaseStartTimers(){
    if (!startGateActive) return;
    startGateActive = false;

    gatedTimeouts.forEach(function(rec, id){
      if (rec.cleared) return;
      rec.realId = nativeSetTimeout(function(){
        gatedTimeouts.delete(id);
        try { rec.callback.apply(window, rec.args); } catch(e) { nativeSetTimeout(function(){ throw e; },0); }
      }, rec.delay);
    });

    gatedIntervals.forEach(function(rec){
      if (rec.cleared) return;
      rec.realId = nativeSetInterval(function(){
        try { rec.callback.apply(window, rec.args); } catch(e) { nativeSetTimeout(function(){ throw e; },0); }
      }, rec.delay);
    });
  }

  /* ---------- MASTER AUDIO STATE ---------- */
  var activeAudio = null;
  var activeEntry = null;
  var serial = 0;
  var paused = false;
  var chunkSequence = null;
  var pendingAmbiguous = null;
  var autoplayGateEl = null;
  var replaying = false;
  var replayAudio = null;
  var replayOverlay = null;

  var historyEntries = [];
  var HISTORY_LIMIT = 8;

  var VOLUME_KEY = 'numero_tour_volume_v1';
  var MUTED_KEY = 'numero_tour_muted_v1';
  var masterVolume = 0.88;
  var masterMuted = false;

  try {
    var savedVol = Number(localStorage.getItem(VOLUME_KEY));
    if (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) masterVolume = savedVol;
    masterMuted = localStorage.getItem(MUTED_KEY) === '1';
    // The fixed-MP3 player owns mute now. Keep page narration enabled so timing remains intact.
    localStorage.setItem('support_center_voice','1');
  } catch(e) {}

  function norm(text){ return String(text || '').replace(/\s+/g,' ').trim(); }

  function effectiveVolume(){ return masterMuted ? 0 : masterVolume; }

  function applyVolume(audio){
    if (!audio) return;
    try { audio.volume = Math.max(0, Math.min(1, effectiveVolume())); } catch(e) {}
  }

  function persistAudioSettings(){
    try {
      localStorage.setItem(VOLUME_KEY, String(masterVolume));
      localStorage.setItem(MUTED_KEY, masterMuted ? '1' : '0');
    } catch(e) {}
  }

  function setMasterVolume(v){
    v = Number(v);
    if (!isFinite(v)) return;
    masterVolume = Math.max(0, Math.min(1, v));
    if (masterVolume > 0 && masterMuted) masterMuted = false;
    applyVolume(activeAudio);
    applyVolume(replayAudio);
    persistAudioSettings();
    syncMasterControls();
  }

  function toggleMasterMute(){
    masterMuted = !masterMuted;
    applyVolume(activeAudio);
    applyVolume(replayAudio);
    persistAudioSettings();
    syncMasterControls();
  }

  /* ---------- SNAPSHOTS FOR 15s REPLAY ---------- */
  function captureSnapshot(){
    try {
      var clone = document.documentElement.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('script,noscript,audio,source'), function(n){
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      Array.prototype.forEach.call(clone.querySelectorAll('[data-tour-master-controls],[data-tour-start-gate],[data-tour-audio-gate],[data-tour-replay-overlay]'), function(n){
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      var head = clone.querySelector('head');
      if (head) {
        Array.prototype.forEach.call(head.querySelectorAll('base'), function(n){ n.parentNode.removeChild(n); });
        var base = document.createElement('base');
        base.href = window.location.href;
        head.insertBefore(base, head.firstChild);
        var style = document.createElement('style');
        style.textContent = '*{animation-play-state:paused!important;transition:none!important;}html,body{overflow:hidden!important;}';
        head.appendChild(style);
      }
      return '<!doctype html>\n' + clone.outerHTML;
    } catch(e) {
      return '';
    }
  }

  function createHistoryEntry(fullText, item){
    var entry = {
      text: fullText,
      file: item.file,
      speaker: item.speaker || '',
      duration: 0,
      snapshot: '',
      startedAt: Date.now(),
      completed: false
    };
    historyEntries.push(entry);
    if (historyEntries.length > HISTORY_LIMIT) historyEntries.shift();

    // Give page dialogue renderers (many use ~70ms) time to display the current line.
    nativeSetTimeout(function(){
      if (historyEntries.indexOf(entry) >= 0) entry.snapshot = captureSnapshot();
    }, 130);
    syncMasterControls();
    return entry;
  }

  function rememberDuration(entry, audio){
    if (!entry || !audio) return;
    var d = Number(audio.duration);
    if (isFinite(d) && d > 0) entry.duration = d;
  }

  /* ---------- FIXED AUDIO CORE ---------- */
  function removeAutoplayGate(){
    if (autoplayGateEl && autoplayGateEl.parentNode) {
      try { autoplayGateEl.parentNode.removeChild(autoplayGateEl); } catch(e) {}
    }
    autoplayGateEl = null;
  }

  function stopAudio(){
    serial += 1;
    removeAutoplayGate();
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch(e) {}
    }
    activeAudio = null;
    activeEntry = null;
    chunkSequence = null;
    pendingAmbiguous = null;
    paused = false;
  }

  function finishUtterance(u){
    nativeSetTimeout(function(){
      if (u && typeof u.onend === 'function') {
        try { u.onend({type:'end', utterance:u}); } catch(e) {}
      }
    }, 35);
  }

  synth.cancel = function(){ stopAudio(); try { original.cancel(); } catch(e) {} };
  synth.pause = function(){
    paused = true;
    if (activeAudio) { try { activeAudio.pause(); } catch(e) {} }
    try { original.pause(); } catch(e) {}
    syncMasterControls();
  };
  synth.resume = function(){
    paused = false;
    if (activeAudio && !replaying) {
      try {
        applyVolume(activeAudio);
        var p = activeAudio.play();
        if (p && p.catch) p.catch(function(){});
      } catch(e) {}
    }
    try { original.resume(); } catch(e) {}
    syncMasterControls();
  };

  function showAutoplayGate(audio, mySerial, fallback){
    if (mySerial !== serial) return;
    if (autoplayGateEl && autoplayGateEl.parentNode) return;

    var gate = document.createElement('div');
    gate.setAttribute('data-tour-audio-gate','1');
    gate.style.cssText = 'position:fixed;inset:0;z-index:2147483645;display:flex;align-items:center;justify-content:center;background:rgba(4,9,13,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:Arial,Helvetica,sans-serif;';

    var button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:18px 26px;background:rgba(12,22,29,.96);color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.38);font:900 16px Arial;letter-spacing:1.5px;cursor:pointer;';
    button.textContent = '▶  CONTINUE AUDIO';
    gate.appendChild(button);
    document.body.appendChild(gate);
    autoplayGateEl = gate;

    function retry(){
      if (mySerial !== serial) { removeAutoplayGate(); return; }
      try {
        applyVolume(audio);
        var again = audio.play();
        if (again && again.then) {
          again.then(function(){
            removeAutoplayGate();
            if (paused) { try { audio.pause(); } catch(e) {} }
          }).catch(function(err){
            if (!err || (err.name !== 'NotAllowedError' && err.name !== 'AbortError')) {
              removeAutoplayGate();
              fallback();
            }
          });
        } else {
          removeAutoplayGate();
        }
      } catch(e) {
        if (!e || (e.name !== 'NotAllowedError' && e.name !== 'AbortError')) {
          removeAutoplayGate();
          fallback();
        }
      }
    }

    button.addEventListener('click', retry);
  }

  function startFullAudio(fullText, consumedText, utterance){
    var map = window.TOUR_AUDIO_MAP || {};
    var item = map[fullText];
    if (!item || !item.file) return false;

    var mySerial = ++serial;
    var audio = new Audio(item.file);
    audio.preload = 'auto';
    applyVolume(audio);
    activeAudio = audio;
    activeEntry = createHistoryEntry(fullText, item);
    pendingAmbiguous = null;

    var consumed = norm(consumedText);
    if (consumed && fullText.indexOf(consumed) === 0 && consumed !== fullText) {
      chunkSequence = { fullText:fullText, remaining:fullText.slice(consumed.length).replace(/^\s+/, '') };
    } else {
      chunkSequence = null;
    }

    function clearAudioOnly(){
      if (mySerial === serial) {
        activeAudio = null;
        activeEntry = null;
      }
    }

    function fireEnd(){
      if (mySerial !== serial) return;
      rememberDuration(activeEntry, audio);
      if (activeEntry) activeEntry.completed = true;
      clearAudioOnly();
      syncMasterControls();
      finishUtterance(utterance);
    }

    function fallback(){
      if (mySerial !== serial) return;
      clearAudioOnly();
      chunkSequence = null;
      pendingAmbiguous = null;
      try { original.speak(utterance); }
      catch(e) {
        if (utterance && typeof utterance.onerror === 'function') {
          try { utterance.onerror({type:'error', error:e, utterance:utterance}); } catch(ignore) {}
        }
      }
    }

    audio.onloadedmetadata = function(){ rememberDuration(activeEntry, audio); syncMasterControls(); };
    audio.onended = fireEnd;
    audio.onerror = fallback;

    try {
      var p = audio.play();
      if (paused) audio.pause();
      if (p && p.catch) p.catch(function(err){
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) showAutoplayGate(audio, mySerial, fallback);
        else fallback();
      });
    } catch(e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) showAutoplayGate(audio, mySerial, fallback);
      else fallback();
    }
    return true;
  }

  synth.speak = function(utterance){
    var text = norm(utterance && utterance.text);
    var map = window.TOUR_AUDIO_MAP || {};
    var prefixes = window.TOUR_AUDIO_PREFIX || {};
    var multi = window.TOUR_AUDIO_PREFIX_MULTI || {};

    if (chunkSequence && text) {
      var rem = norm(chunkSequence.remaining);
      if (rem === text || rem.indexOf(text + ' ') === 0 || rem.indexOf(text) === 0) {
        chunkSequence.remaining = rem.slice(text.length).replace(/^\s+/, '');
        if (!chunkSequence.remaining) chunkSequence = null;
        finishUtterance(utterance);
        return;
      }
      chunkSequence = null;
    }

    if (pendingAmbiguous && text) {
      var combined = norm(pendingAmbiguous.consumed + ' ' + text);
      var candidates = pendingAmbiguous.candidates.filter(function(full){ return full.indexOf(combined) === 0; });
      if (candidates.length === 1 && map[candidates[0]]) {
        if (startFullAudio(candidates[0], combined, utterance)) return;
      }
      if (candidates.length > 1) {
        pendingAmbiguous = { consumed:combined, candidates:candidates };
        finishUtterance(utterance);
        return;
      }
      pendingAmbiguous = null;
    }

    if (map[text]) {
      if (startFullAudio(text, text, utterance)) return;
    }
    if (prefixes[text] && map[prefixes[text]]) {
      if (startFullAudio(prefixes[text], text, utterance)) return;
    }
    if (multi[text] && multi[text].length) {
      pendingAmbiguous = { consumed:text, candidates:multi[text].slice() };
      finishUtterance(utterance);
      return;
    }

    return original.speak(utterance);
  };

  /* ---------- PAGE PAUSE BRIDGE ---------- */
  function nativePauseControl(){
    return document.querySelector('#pauseBtn,#pauseToggle,#presentationControl');
  }

  function pageLooksPaused(){
    if (document.body && document.body.classList.contains('presentation-paused')) return true;
    var c = nativePauseControl();
    var txt = c ? String(c.textContent || '').toUpperCase() : '';
    if (txt.indexOf('PLAY') >= 0 || txt.indexOf('RESUME') >= 0 || txt.indexOf('▶') >= 0) return true;
    try { if (synth.paused) return true; } catch(e) {}
    return paused;
  }

  function setPagePaused(wantPaused){
    var current = pageLooksPaused();
    if (current === wantPaused) return;
    var c = nativePauseControl();
    if (c && typeof c.click === 'function') {
      try { c.click(); return; } catch(e) {}
    }
    if (wantPaused) synth.pause(); else synth.resume();
  }

  function togglePagePause(){
    if (replaying) return;
    setPagePaused(!pageLooksPaused());
    nativeSetTimeout(syncMasterControls, 60);
  }

  /* ---------- 15 SECOND SENTENCE-SNAP REPLAY ---------- */
  function showReplaySnapshot(entry){
    if (!entry || !entry.snapshot) return;
    if (!replayOverlay) {
      replayOverlay = document.createElement('iframe');
      replayOverlay.setAttribute('data-tour-replay-overlay','1');
      replayOverlay.setAttribute('aria-hidden','true');
      replayOverlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483000;background:#05090d;pointer-events:none;';
      document.body.appendChild(replayOverlay);
    }
    try { replayOverlay.srcdoc = entry.snapshot; } catch(e) {}
  }

  function removeReplayOverlay(){
    if (replayOverlay && replayOverlay.parentNode) {
      try { replayOverlay.parentNode.removeChild(replayOverlay); } catch(e) {}
    }
    replayOverlay = null;
  }

  function playReplayFile(entry, maxSeconds){
    return new Promise(function(resolve){
      if (!entry || !entry.file) { resolve(); return; }
      showReplaySnapshot(entry);
      var a = new Audio(entry.file);
      replayAudio = a;
      applyVolume(a);
      var finished = false;
      function done(){
        if (finished) return;
        finished = true;
        try { a.pause(); } catch(e) {}
        if (replayAudio === a) replayAudio = null;
        resolve();
      }
      a.onerror = done;
      a.onended = done;
      if (isFinite(maxSeconds) && maxSeconds >= 0) {
        a.ontimeupdate = function(){
          if (a.currentTime >= maxSeconds) done();
        };
      }
      try {
        var p = a.play();
        if (p && p.catch) p.catch(done);
      } catch(e) { done(); }
    });
  }

  function findRewindTarget(secondsBack){
    if (!historyEntries.length) return null;
    var liveIndex = historyEntries.length - 1;
    var currentOffset = 0;

    if (activeEntry && historyEntries[liveIndex] === activeEntry && activeAudio) {
      currentOffset = Number(activeAudio.currentTime) || 0;
    } else {
      currentOffset = Number(historyEntries[liveIndex].duration) || 0;
    }

    var remaining = Math.max(0, Number(secondsBack) || 0);
    var i = liveIndex;
    var offset = currentOffset;

    while (i > 0 && remaining > offset) {
      remaining -= offset;
      i -= 1;
      offset = Number(historyEntries[i].duration) || 0;
    }

    // If the target lands anywhere inside a sentence, snap to that sentence's start.
    return { targetIndex:i, liveIndex:liveIndex, liveOffset:currentOffset };
  }

  async function rewind15(){
    if (replaying || !historyEntries.length) return;
    var target = findRewindTarget(15);
    if (!target) return;

    replaying = true;
    syncMasterControls();

    var wasPaused = pageLooksPaused();
    var originalAudioTime = activeAudio ? (Number(activeAudio.currentTime) || 0) : 0;
    var originalActive = activeAudio;

    setPagePaused(true);
    if (originalActive) {
      try { originalActive.pause(); } catch(e) {}
    }

    try {
      for (var i = target.targetIndex; i <= target.liveIndex; i++) {
        var entry = historyEntries[i];
        var limit = NaN;
        if (i === target.liveIndex && originalActive && entry === activeEntry) {
          limit = Math.max(0, originalAudioTime);
          if (limit < 0.05) break;
        }
        await playReplayFile(entry, limit);
      }
    } finally {
      if (replayAudio) { try { replayAudio.pause(); } catch(e) {} }
      replayAudio = null;
      removeReplayOverlay();
      replaying = false;
      if (!wasPaused) setPagePaused(false);
      syncMasterControls();
    }
  }

  /* ---------- MASTER CONTROLS UI ---------- */
  var controlsEl = null;
  var muteBtn = null;
  var volumeInput = null;
  var rewindBtn = null;
  var pauseBtn = null;

  function hideLegacyControls(){
    var selectors = ['#voiceBtn','#voiceToggle','#tourVoiceToggle','#soundControl','#pauseBtn','#pauseToggle','#presentationControl'];
    selectors.forEach(function(sel){
      var el = document.querySelector(sel);
      if (!el || el.closest('[data-tour-master-controls]')) return;
      el.setAttribute('data-tour-native-hidden','1');
      el.style.setProperty('display','none','important');
    });
  }

  function buildMasterControls(){
    if (!document.body || controlsEl) return;

    controlsEl = document.createElement('div');
    controlsEl.setAttribute('data-tour-master-controls','1');
    controlsEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(8,16,22,.82);box-shadow:0 14px 38px rgba(0,0,0,.28);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:Arial,Helvetica,sans-serif;';

    function mkButton(title){
      var b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.style.cssText = 'height:38px;min-width:42px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:rgba(255,255,255,.08);color:#fff;font:900 15px Arial;cursor:pointer;line-height:1;';
      return b;
    }

    rewindBtn = mkButton('Back about 15 seconds — snapped to the beginning of a sentence');
    rewindBtn.textContent = '↶ 15s';
    rewindBtn.style.fontSize = '12px';
    rewindBtn.addEventListener('click', rewind15);

    muteBtn = mkButton('Mute / unmute tour audio');
    muteBtn.addEventListener('click', toggleMasterMute);

    var volumeWrap = document.createElement('div');
    volumeWrap.style.cssText = 'display:flex;align-items:center;width:92px;';
    volumeInput = document.createElement('input');
    volumeInput.type = 'range';
    volumeInput.min = '0';
    volumeInput.max = '100';
    volumeInput.step = '1';
    volumeInput.title = 'Tour volume';
    volumeInput.style.cssText = 'width:92px;accent-color:#fff;cursor:pointer;';
    volumeInput.addEventListener('input', function(){ setMasterVolume(Number(volumeInput.value) / 100); });
    volumeWrap.appendChild(volumeInput);

    pauseBtn = mkButton('Pause / play tour');
    pauseBtn.addEventListener('click', togglePagePause);

    controlsEl.appendChild(rewindBtn);
    controlsEl.appendChild(muteBtn);
    controlsEl.appendChild(volumeWrap);
    controlsEl.appendChild(pauseBtn);
    document.body.appendChild(controlsEl);

    hideLegacyControls();
    syncMasterControls();

    var observer = new MutationObserver(function(){
      hideLegacyControls();
      syncMasterControls();
    });
    observer.observe(document.body, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  }

  function syncMasterControls(){
    if (!controlsEl) return;
    if (muteBtn) {
      muteBtn.textContent = masterMuted || masterVolume <= 0.001 ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', masterMuted ? 'Unmute tour audio' : 'Mute tour audio');
    }
    if (volumeInput && document.activeElement !== volumeInput) volumeInput.value = String(Math.round(masterVolume * 100));
    if (pauseBtn) {
      pauseBtn.textContent = pageLooksPaused() ? '▶' : '⏸';
      pauseBtn.setAttribute('aria-label', pageLooksPaused() ? 'Play tour' : 'Pause tour');
    }
    if (rewindBtn) {
      var can = historyEntries.length > 0 && !replaying;
      rewindBtn.disabled = !can;
      rewindBtn.style.opacity = can ? '1' : '.42';
      rewindBtn.style.cursor = can ? 'pointer' : 'default';
    }
  }

  /* ---------- START TOUR OVERLAY ---------- */
  function unlockOriginAudio(){
    // A user gesture on START TOUR is normally enough for GitHub Pages.
    // This tiny silent play additionally primes media playback without touching narration.
    try {
      var silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      silent.volume = 0;
      var p = silent.play();
      if (p && p.catch) p.catch(function(){});
    } catch(e) {}
    try { original.resume(); } catch(e) {}
  }

  function showStartTourGate(){
    if (!isDoorPage || !document.body) return;
    if (document.querySelector('[data-tour-start-gate]')) return;

    var gate = document.createElement('div');
    gate.setAttribute('data-tour-start-gate','1');
    gate.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% 35%,rgba(62,116,145,.24),transparent 34%),linear-gradient(135deg,rgba(5,11,16,.97),rgba(10,22,29,.97));font-family:Arial,Helvetica,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText = 'width:min(520px,92vw);padding:34px 30px 30px;border:1px solid rgba(255,255,255,.16);border-radius:26px;background:rgba(14,25,33,.74);box-shadow:0 28px 90px rgba(0,0,0,.42);text-align:center;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);';

    var brand = document.createElement('div');
    brand.innerHTML = '<div style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#fff">Numero <span style="font-weight:700">eSIM</span></div><div style="margin-top:5px;font-size:12px;font-weight:800;letter-spacing:2.5px;color:rgba(255,255,255,.62)">BE LOCAL ANYWHERE</div>';

    var line = document.createElement('div');
    line.style.cssText = 'width:64px;height:1px;margin:22px auto;background:rgba(255,255,255,.22);';

    var title = document.createElement('div');
    title.textContent = 'CUSTOMER SUPPORT CENTER';
    title.style.cssText = 'font-size:13px;font-weight:900;letter-spacing:3px;color:rgba(255,255,255,.78);';

    var start = document.createElement('button');
    start.type = 'button';
    start.textContent = 'START TOUR';
    start.style.cssText = 'margin-top:22px;min-width:210px;height:54px;padding:0 28px;border:1px solid rgba(255,255,255,.25);border-radius:16px;background:#fff;color:#101a21;font:900 14px Arial;letter-spacing:2px;cursor:pointer;box-shadow:0 14px 38px rgba(0,0,0,.25);';

    var hint = document.createElement('div');
    hint.textContent = 'Audio starts after this click';
    hint.style.cssText = 'margin-top:12px;font-size:11px;color:rgba(255,255,255,.55);';

    card.appendChild(brand);
    card.appendChild(line);
    card.appendChild(title);
    card.appendChild(start);
    card.appendChild(hint);
    gate.appendChild(card);
    document.body.appendChild(gate);

    start.addEventListener('click', function(){
      unlockOriginAudio();
      releaseStartTimers();
      try { gate.parentNode.removeChild(gate); } catch(e) {}
      buildMasterControls();
    });
  }

  /* ---------- BOOT ---------- */
  function boot(){
    buildMasterControls();
    if (isDoorPage) showStartTourGate();
    hideLegacyControls();
    syncMasterControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.supportTourFixedAudio = {
    stop: function(){ synth.cancel(); },
    usingFixedAudio: true,
    setVolume: setMasterVolume,
    mute: function(v){ masterMuted = (v === undefined ? true : !!v); applyVolume(activeAudio); applyVolume(replayAudio); persistAudioSettings(); syncMasterControls(); },
    toggleMute: toggleMasterMute,
    rewind15: rewind15
  };

  window.addEventListener('pagehide', function(){
    try { if (replayAudio) replayAudio.pause(); } catch(e) {}
    try { synth.cancel(); } catch(e) {}
  });
  window.addEventListener('beforeunload', function(){
    try { if (replayAudio) replayAudio.pause(); } catch(e) {}
    try { synth.cancel(); } catch(e) {}
  });
})();
