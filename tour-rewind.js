(function(){
  'use strict';

  /*
    Numero Tour — safe 15-second rewind controller.

    The presentation is not a video, so rewind is implemented as a checkpoint
    replay: we remember the start of every spoken line. When the viewer taps
    ↶ 15s, we choose the spoken line that was active about 15 seconds earlier,
    reload that chapter, fast-forward its deterministic timers silently, and
    resume NORMAL playback at the BEGINNING of that line.

    This file does not change dialogue text, audio files, speaker casting, or
    page sequence data.
  */

  var HISTORY_KEY = 'numero_tour_rewind_history_v13';
  var TARGET_KEY = 'numero_tour_rewind_target_v13';
  var MAX_HISTORY = 500;
  var REWIND_MS = 15000;

  var nativeDateNow = Date.now.bind(Date);
  var nativeSetTimeout = window.setTimeout.bind(window);
  var nativeClearTimeout = window.clearTimeout.bind(window);
  var nativeSetInterval = window.setInterval.bind(window);
  var nativeClearInterval = window.clearInterval.bind(window);

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function pageName(){
    try {
      if (window.SupportTourShared && window.SupportTourShared.page) return clean(window.SupportTourShared.page) || 'index';
    } catch(e) {}
    var name = (location.pathname.split('/').pop() || 'index.html').replace(/\.html?$/i,'');
    return name || 'index';
  }
  var PAGE = pageName();

  function readJson(key, fallback){
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return fallback;
      var value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch(e) { return fallback; }
  }
  function writeJson(key, value){
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
  }
  function removeKey(key){ try { sessionStorage.removeItem(key); } catch(e) {} }

  var target = readJson(TARGET_KEY, null);
  var queryRewind = false;
  try { queryRewind = new URL(window.location.href).searchParams.get('rw') === '1'; } catch(e) {}
  var fastForward = !!(queryRewind && target && target.page === PAGE && target.text);
  window.__NUMERO_REWIND_ACTIVE = fastForward;

  /* A normal visit to the entrance is a new timeline. A rewind into the
     entrance is not: keep the history/started state intact. */
  if (PAGE === 'index' && !fastForward) {
    removeKey(HISTORY_KEY);
    removeKey(TARGET_KEY);
  }
  if (fastForward) {
    try { sessionStorage.setItem('numero_tour_started','1'); } catch(e) {}
  }

  var occurrence = Object.create(null);
  var lastNormalCheckpoint = { text:'', at:0 };

  function loadHistory(){
    var h = readJson(HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  }
  function saveHistory(h){
    if (h.length > MAX_HISTORY) h = h.slice(h.length - MAX_HISTORY);
    writeJson(HISTORY_KEY, h);
  }

  function nextOccurrence(text){
    text = clean(text);
    var n = (occurrence[text] || 0) + 1;
    occurrence[text] = n;
    return n;
  }

  function recordCheckpoint(text, kind, forcedOccurrence){
    text = clean(text);
    if (!text) return;
    var now = nativeDateNow();

    /* A failed HTMLAudio attempt can fall back to native TTS immediately.
       Treat that as the same spoken line, not two rewind checkpoints. */
    if (!fastForward && lastNormalCheckpoint.text === text && now - lastNormalCheckpoint.at < 850) {
      return;
    }

    var n = forcedOccurrence || nextOccurrence(text);
    var h = loadHistory();
    h.push({
      page: PAGE,
      text: text,
      occurrence: n,
      kind: kind || 'speech',
      at: now,
      dev: /(?:^|[?&])dev=1(?:&|$)/.test(location.search)
    });
    saveHistory(h);
    lastNormalCheckpoint = { text:text, at:now };
  }

  /* ---------------- Virtual timer engine used ONLY while rewinding ---------------- */
  var virtualNow = 0;
  var virtualBase = nativeDateNow();
  var queue = [];
  var draining = false;
  var nextTimerId = 1;

  function fakeTimer(kind, fn, delay, args){
    var ms = Math.max(0, Number(delay) || 0);
    var t = {
      __numeroRewindTimer: true,
      id: nextTimerId++,
      kind: kind,
      fn: fn,
      args: args || [],
      interval: kind === 'interval' ? Math.max(1, ms) : 0,
      due: virtualNow + ms,
      canceled: false,
      realStarter: null,
      realId: null
    };
    queue.push(t);
    scheduleDrain();
    return t;
  }

  function scheduleDrain(){
    if (!fastForward || draining) return;
    draining = true;
    nativeSetTimeout(drainOne, 0);
  }

  function sortQueue(){ queue.sort(function(a,b){ return a.due - b.due || a.id - b.id; }); }

  function callTimer(t){
    if (t.canceled) return;
    try {
      if (typeof t.fn === 'function') t.fn.apply(window, t.args);
      else if (t.fn != null) (0,eval)(String(t.fn));
    } catch(e) {
      nativeSetTimeout(function(){ throw e; },0);
    }
  }

  function drainOne(){
    draining = false;
    if (!fastForward) return;
    sortQueue();
    var t = null;
    while (queue.length && !t) {
      var candidate = queue.shift();
      if (!candidate.canceled) t = candidate;
    }
    if (!t) return;

    virtualNow = Math.max(virtualNow, t.due);
    callTimer(t);

    if (fastForward && t.kind === 'interval' && !t.canceled) {
      t.due = virtualNow + t.interval;
      queue.push(t);
    }
    scheduleDrain();
  }

  function patchedSetTimeout(fn, delay){
    var args = Array.prototype.slice.call(arguments,2);
    if (!fastForward) return nativeSetTimeout.apply(window,[fn,delay].concat(args));
    return fakeTimer('timeout',fn,delay,args);
  }
  function patchedSetInterval(fn, delay){
    var args = Array.prototype.slice.call(arguments,2);
    if (!fastForward) return nativeSetInterval.apply(window,[fn,delay].concat(args));
    return fakeTimer('interval',fn,delay,args);
  }
  function cancelFake(id, intervalMode){
    if (id && id.__numeroRewindTimer) {
      id.canceled = true;
      if (id.realStarter != null) nativeClearTimeout(id.realStarter);
      if (id.realId != null) {
        if (intervalMode || id.kind === 'interval') nativeClearInterval(id.realId);
        else nativeClearTimeout(id.realId);
      }
      return true;
    }
    return false;
  }
  function patchedClearTimeout(id){ if (!cancelFake(id,false)) nativeClearTimeout(id); }
  function patchedClearInterval(id){ if (!cancelFake(id,true)) nativeClearInterval(id); }

  function installVirtualClock(){
    window.setTimeout = patchedSetTimeout;
    window.clearTimeout = patchedClearTimeout;
    window.setInterval = patchedSetInterval;
    window.clearInterval = patchedClearInterval;
    Date.now = function(){ return fastForward ? (virtualBase + virtualNow) : nativeDateNow(); };
  }

  function restoreClockAndFlush(){
    Date.now = nativeDateNow;
    window.setTimeout = patchedSetTimeout;
    window.clearTimeout = patchedClearTimeout;
    window.setInterval = patchedSetInterval;
    window.clearInterval = patchedClearInterval;

    var pending = queue.slice();
    queue.length = 0;
    pending.forEach(function(t){
      if (t.canceled) return;
      var remaining = Math.max(0, t.due - virtualNow);
      if (t.kind === 'interval') {
        t.realStarter = nativeSetTimeout(function(){
          t.realStarter = null;
          if (t.canceled) return;
          callTimer(t);
          if (!t.canceled) {
            t.realId = nativeSetInterval(function(){ callTimer(t); }, t.interval);
          }
        }, remaining);
      } else {
        t.realId = nativeSetTimeout(function(){ callTimer(t); }, remaining);
      }
    });
  }

  if (fastForward) installVirtualClock();

  /* ---------------- Visual fast-forward guard ---------------- */
  var fastStyle = null;
  function installFastStyle(){
    if (!fastForward || !document.documentElement) return;
    document.documentElement.classList.add('numero-rewind-fast');
    fastStyle = document.createElement('style');
    fastStyle.id = 'numeroRewindFastStyle';
    fastStyle.textContent =
      'html.numero-rewind-fast *,html.numero-rewind-fast *::before,html.numero-rewind-fast *::after{' +
      'animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}' +
      '#numeroRewindButton{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(fastStyle);
  }
  installFastStyle();

  function cleanRewindParam(){
    try {
      var u = new URL(location.href);
      u.searchParams.delete('rw');
      window.history.replaceState(null,'',u.pathname + (u.search ? u.search : '') + u.hash);
    } catch(e) {}
  }

  function toast(message){
    if (!document.body) return;
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = 'position:fixed;left:50%;bottom:82px;z-index:2147483646;transform:translateX(-50%);' +
      'padding:9px 13px;border-radius:999px;background:rgba(8,13,17,.92);color:#fff;border:1px solid rgba(255,255,255,.18);' +
      'box-shadow:0 12px 34px rgba(0,0,0,.34);font:800 11px Arial,Helvetica,sans-serif;letter-spacing:.7px;pointer-events:none;';
    document.body.appendChild(el);
    nativeSetTimeout(function(){ try{ el.remove(); }catch(e){} },1400);
  }

  function finishFastForward(text, kind, occurrenceNo){
    if (!fastForward) return;
    fastForward = false;
    window.__NUMERO_REWIND_ACTIVE = false;
    removeKey(TARGET_KEY);
    restoreClockAndFlush();
    try { document.documentElement.classList.remove('numero-rewind-fast'); } catch(e) {}
    try { if (fastStyle) fastStyle.remove(); } catch(e) {}
    cleanRewindParam();
    recordCheckpoint(text,kind,occurrenceNo);
    nativeSetTimeout(function(){ toast('↶ 15s · resumed from line start'); },60);
  }

  function speechCheckpoint(text, kind){
    text = clean(text);
    if (!text) return {skip:false,target:false,occurrence:0};
    var n = nextOccurrence(text);

    if (fastForward) {
      var match = clean(target && target.text) === text && Number(target && target.occurrence || 1) === n;
      if (match) {
        finishFastForward(text,kind,n);
        return {skip:false,target:true,occurrence:n};
      }
      return {skip:true,target:false,occurrence:n};
    }

    recordCheckpoint(text,kind,n);
    return {skip:false,target:false,occurrence:n};
  }

  /* ---------------- Native TTS shim (installed before tour-audio.js) ---------------- */
  if (window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') {
    var nativeSpeechSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function(utterance){
      var text = clean(utterance && utterance.text);
      var decision = speechCheckpoint(text,'native');
      if (decision.skip) {
        window.setTimeout(function(){
          try {
            if (utterance && typeof utterance.onend === 'function') {
              utterance.onend({type:'end',utterance:utterance,rewindFastForward:true});
            }
          } catch(e) {}
        },0);
        return;
      }
      return nativeSpeechSpeak(utterance);
    };
  }

  /* ---------------- Fixed MP3 checkpoint shim ---------------- */
  var reverseAudio = Object.create(null);
  function basename(url){
    var s = String(url || '').split('#')[0].split('?')[0];
    return s.substring(s.lastIndexOf('/') + 1).toLowerCase();
  }
  try {
    var map = window.TOUR_AUDIO_MAP || {};
    Object.keys(map).forEach(function(text){
      var item = map[text];
      if (item && item.file) reverseAudio[basename(item.file)] = clean(text);
    });
  } catch(e) {}

  if (window.HTMLMediaElement && HTMLMediaElement.prototype) {
    var mediaProto = HTMLMediaElement.prototype;
    var nativeMediaPlay = mediaProto.play;
    var nativeMediaLoad = mediaProto.load;

    if (typeof nativeMediaLoad === 'function') {
      mediaProto.load = function(){
        this.__numeroRewindLoadGeneration = (this.__numeroRewindLoadGeneration || 0) + 1;
        this.__numeroRewindCountedGeneration = -1;
        return nativeMediaLoad.apply(this,arguments);
      };
    }

    if (typeof nativeMediaPlay === 'function') {
      mediaProto.play = function(){
        var src = this.currentSrc || this.src || '';
        var text = reverseAudio[basename(src)] || '';
        var gen = Number(this.__numeroRewindLoadGeneration || 0);
        var isNewLine = !!text && this.__numeroRewindCountedGeneration !== gen;
        var decision = null;

        if (isNewLine) {
          this.__numeroRewindCountedGeneration = gen;
          decision = speechCheckpoint(text,'fixed');
        }

        if (fastForward) {
          /* During replay, every fixed-audio line BEFORE the target finishes
             instantly. The target itself turns fast-forward off above and then
             falls through to the real play() from time 0. */
          if (!decision || decision.skip) {
            var media = this;
            window.setTimeout(function(){
              try {
                if (typeof media.onended === 'function') media.onended({type:'ended',target:media,rewindFastForward:true});
                else media.dispatchEvent(new Event('ended'));
              } catch(e) {}
            },0);
            return Promise.resolve();
          }
        }

        return nativeMediaPlay.apply(this,arguments);
      };
    }
  }

  /* If rewind targets the entrance, START TOUR must stay unlocked. index.html
     installs its listener in the body script, so dispatch after DOMContentLoaded. */
  if (fastForward && PAGE === 'index') {
    document.addEventListener('DOMContentLoaded',function(){
      try { window.dispatchEvent(new CustomEvent('numero-tour-started')); }
      catch(e){ try { window.dispatchEvent(new Event('numero-tour-started')); } catch(_){} }
    },{once:true});
  }

  /* Safety: if a changed future build cannot find the stored target, do not
     leave the page permanently fast-forwarding. This watchdog uses native time. */
  if (fastForward) {
    nativeSetTimeout(function(){
      if (!fastForward) return;
      fastForward = false;
      window.__NUMERO_REWIND_ACTIVE = false;
      removeKey(TARGET_KEY);
      restoreClockAndFlush();
      try { document.documentElement.classList.remove('numero-rewind-fast'); } catch(e) {}
      try { if (fastStyle) fastStyle.remove(); } catch(e) {}
      cleanRewindParam();
      toast('Rewind target unavailable · continuing normally');
    },12000);
  }

  /* ---------------- Rewind button ---------------- */
  function chooseTarget(){
    var h = loadHistory();
    if (!h.length) return null;
    var cutoff = nativeDateNow() - REWIND_MS;
    var chosen = null;
    var chosenIndex = -1;
    for (var i=0;i<h.length;i++) {
      if (Number(h[i].at || 0) <= cutoff) {
        chosen = h[i];
        chosenIndex = i;
      }
    }
    if (!chosen) {
      chosen = h[0];
      chosenIndex = 0;
    }
    return {item:chosen,index:chosenIndex,history:h};
  }

  function rewind15(){
    var pick = chooseTarget();
    if (!pick || !pick.item || !pick.item.text) {
      toast('Already at the beginning');
      return;
    }

    var chosen = pick.item;
    var now = nativeDateNow();
    var shift = now - Number(chosen.at || now);

    /* Rebase the retained past to the new "now" and remove the old future.
       This makes repeated 15-second rewinds behave naturally after a rewind. */
    var kept = pick.history.slice(0,pick.index);
    kept = kept.map(function(x){
      var copy = {};
      Object.keys(x).forEach(function(k){ copy[k]=x[k]; });
      copy.at = Number(copy.at || 0) + shift;
      return copy;
    });
    saveHistory(kept);

    writeJson(TARGET_KEY,{
      page: chosen.page,
      text: chosen.text,
      occurrence: Number(chosen.occurrence || 1),
      dev: !!chosen.dev,
      requestedAt: now
    });

    try {
      if (window.supportTourFixedAudio && typeof window.supportTourFixedAudio.stop === 'function') {
        window.supportTourFixedAudio.stop();
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch(e) {}

    var dest = clean(chosen.page || PAGE) + '.html?rw=1&t=' + now;
    if (chosen.dev || /(?:^|[?&])dev=1(?:&|$)/.test(location.search)) dest += '&dev=1';
    location.assign(dest);
  }

  function positionButton(btn){
    if (!btn || !document.body) return;
    var control = document.querySelector('.presentation-control');
    if (control) {
      var r = control.getBoundingClientRect();
      var right = Math.max(12, window.innerWidth - r.left + 10);
      var bottom = Math.max(12, window.innerHeight - r.bottom);
      btn.style.right = right + 'px';
      btn.style.bottom = bottom + 'px';
    } else {
      btn.style.right = '82px';
      btn.style.bottom = '18px';
    }
  }

  function addButton(){
    if (!document.body || document.getElementById('numeroRewindButton')) return;
    var btn = document.createElement('button');
    btn.id = 'numeroRewindButton';
    btn.type = 'button';
    btn.setAttribute('aria-label','Rewind 15 seconds');
    btn.title = 'Rewind 15 seconds';
    btn.innerHTML = '<span aria-hidden="true" style="font-size:17px;line-height:1">↶</span><span>15s</span>';
    btn.style.cssText =
      'position:fixed;z-index:20040;height:40px;min-width:66px;padding:0 12px;border-radius:999px;' +
      'display:inline-flex;align-items:center;justify-content:center;gap:5px;color:#fff;background:rgba(15,12,10,.78);' +
      'border:1px solid rgba(255,255,255,.20);box-shadow:0 12px 30px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.08);' +
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);cursor:pointer;user-select:none;' +
      'font:800 11px Arial,Helvetica,sans-serif;letter-spacing:.5px;touch-action:manipulation;transition:none;';
    btn.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); rewind15(); });
    document.body.appendChild(btn);
    positionButton(btn);
    window.addEventListener('resize',function(){ positionButton(btn); });
    if (window.ResizeObserver) {
      var c = document.querySelector('.presentation-control');
      if (c) { try { new ResizeObserver(function(){ positionButton(btn); }).observe(c); } catch(e) {} }
    }
  }

  function initButton(){
    addButton();
    /* Keep it hidden behind the first START TOUR gate. */
    if (PAGE === 'index') {
      var btn = document.getElementById('numeroRewindButton');
      var started = false;
      try { started = sessionStorage.getItem('numero_tour_started') === '1'; } catch(e) {}
      if (btn && !started && !fastForward) btn.style.visibility = 'hidden';
      window.addEventListener('numero-tour-started',function(){
        var b = document.getElementById('numeroRewindButton');
        if (b) b.style.visibility = 'visible';
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initButton,{once:true});
  else initButton();

  window.SupportTourRewind = {
    rewind15: rewind15,
    isFastForwarding: function(){ return !!fastForward; },
    page: PAGE
  };
})();
