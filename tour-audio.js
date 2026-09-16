(function(){
  'use strict';

  // First-run preference: Arabic captions start ON.
  // This migration runs once per browser; after that the user's own choice is preserved.
  try {
    var __arInitKey = 'numero_ar_default_on_v1';
    if (localStorage.getItem(__arInitKey) !== '1') {
      localStorage.setItem('support_center_ar', '1');
      localStorage.setItem(__arInitKey, '1');
    }
  } catch(e) {}
  // The entrance page is a real start gate: the presentation must not move
  // until the visitor clicks START TOUR. index.html reads this flag and keeps
  // its own timeline paused until the audio layer dispatches numero-tour-started.
  var fileName = (window.location.pathname.split('/').pop() || '').toLowerCase();
  var isDoorPage = !fileName || fileName === 'index.html';

  // START TOUR is the single permission/start gesture for the whole visit.
  // Entering the door page begins a fresh visit; later chapters inherit the
  // session flag without asking the visitor to click again.
  var tourWasStarted = false;
  try {
    if (isDoorPage) sessionStorage.removeItem('numero_tour_started');
    tourWasStarted = sessionStorage.getItem('numero_tour_started') === '1';
  } catch(e) {}

  var canInstallFixedAudio = !!window.speechSynthesis;
  if (isDoorPage && canInstallFixedAudio) window.__numeroTourStartPending = true;

  // Reuse ONE HTMLAudioElement for the entire tour. When START TOUR is clicked
  // this element is "blessed" by the real user gesture, then reused for every
  // MP3 instead of creating a new Audio() object for each sentence.
  var sharedAudio = window.__numeroTourSharedAudio;
  if (!sharedAudio) {
    try {
      sharedAudio = new Audio();
      sharedAudio.preload = 'auto';
      window.__numeroTourSharedAudio = sharedAudio;
    } catch(e) {
      sharedAudio = null;
    }
  }

  if (!canInstallFixedAudio || window.__tourFixedAudioInstalled) return;
  window.__tourFixedAudioInstalled = true;

  var synth = window.speechSynthesis;
  var original = {
    speak: synth.speak.bind(synth),
    cancel: synth.cancel.bind(synth),
    pause: synth.pause.bind(synth),
    resume: synth.resume.bind(synth)
  };

  var activeAudio = null;
  var serial = 0;
  var paused = false;
  var chunkSequence = null;     // full MP3 already played; silently consume later chunks
  var pendingAmbiguous = null;  // wait for enough chunks to identify a line

  // SIMPLE/STABLE first-page start gate.
  // The page timeline itself is paused by index.html until the start event.
  var userStarted = !isDoorPage;
  var startGateEl = null;
  var pendingFirstPlay = null;

  function removeStartGate(){
    if (startGateEl && startGateEl.parentNode) {
      try { startGateEl.parentNode.removeChild(startGateEl); } catch(e) {}
    }
    startGateEl = null;
  }

  function notifyTourStarted(){
    userStarted = true;
    tourWasStarted = true;
    window.__numeroTourStartPending = false;
    try { sessionStorage.setItem('numero_tour_started','1'); } catch(e) {}
    try { localStorage.setItem('support_center_voice','1'); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('numero-tour-started')); }
    catch(e) { try { window.dispatchEvent(new Event('numero-tour-started')); } catch(_) {} }
  }

  function primeMediaFromGesture(){
    /*
      Do not merely fire a silent temporary Audio() and immediately continue.
      That was the source of the later ENABLE AUDIO interruption. We start the
      SAME shared media element here, inside the real START TOUR click, and keep
      it alive until the first narration replaces its source.
    */
    return new Promise(function(resolve){
      try {
        var SILENT =
          'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

        if (!sharedAudio) {
          sharedAudio = new Audio();
          sharedAudio.preload = 'auto';
          window.__numeroTourSharedAudio = sharedAudio;
        }

        // Clear handlers left by any previous narration before using the
        // element as the start-permission primer.
        sharedAudio.onended = null;
        sharedAudio.onerror = null;
        sharedAudio.onplaying = null;
        sharedAudio.loop = true;
        sharedAudio.volume = 1;
        sharedAudio.src = SILENT;
        try { sharedAudio.currentTime = 0; } catch(e) {}

        var p = sharedAudio.play();
        if (p && typeof p.then === 'function') {
          p.then(function(){
            // Also resume WebAudio while the user gesture is still active.
            try {
              var AC = window.AudioContext || window.webkitAudioContext;
              if (AC) {
                var ctx = window.__numeroAudioContext || (window.__numeroAudioContext = new AC());
                if (ctx.state === 'suspended') ctx.resume().catch(function(){});
              }
            } catch(e) {}
            resolve(true);
          }).catch(function(){ resolve(false); });
        } else {
          resolve(true);
        }
      } catch(e) {
        resolve(false);
      }
    });
  }

  function showStartGate(){
    if (!isDoorPage || userStarted || startGateEl || !document.body) return;

    var gate = document.createElement('div');
    gate.setAttribute('data-tour-start-gate','1');
    gate.setAttribute('role','dialog');
    gate.setAttribute('aria-modal','true');
    gate.setAttribute('aria-label','Start Numero Support Tour');
    gate.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px;' +
      'background:radial-gradient(circle at 18% 5%,rgba(0,193,255,.18),transparent 30%),' +
      'radial-gradient(circle at 92% 96%,rgba(191,48,255,.16),transparent 34%),' +
      'linear-gradient(145deg,#081923 0%,#102733 52%,#111427 100%);' +
      'font-family:Arial,Helvetica,sans-serif;color:#fff;overflow:auto;';

    var box = document.createElement('div');
    box.style.cssText =
      'position:relative;width:min(520px,94vw);padding:32px 34px 28px;border-radius:24px;text-align:center;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.075));' +
      'border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);' +
      'box-shadow:0 28px 80px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.11);';

    function detectLogoSrc(){
      try { if (window.TOUR_DATA && window.TOUR_DATA.logo_url) return window.TOUR_DATA.logo_url; } catch(e) {}
      try {
        var preload = document.querySelector('link[rel="preload"][as="image"][href]');
        if (preload && preload.href) return preload.href;
      } catch(e) {}
      return 'assets/images/Q5DSMWO.png';
    }

    var overline = document.createElement('div');
    overline.textContent = 'NUMERO SUPPORT TOUR';
    overline.style.cssText = 'font-size:11px;font-weight:800;letter-spacing:3.2px;color:rgba(255,255,255,.68);margin-bottom:20px;';

    var brandImg = document.createElement('img');
    brandImg.src = detectLogoSrc();
    brandImg.alt = 'Numero eSIM';
    brandImg.style.cssText = 'width:104px;height:104px;display:block;object-fit:contain;margin:0 auto 20px;filter:drop-shadow(0 14px 26px rgba(0,0,0,.28));';

    var brandText = document.createElement('div');
    brandText.textContent = 'Numero eSIM';
    brandText.style.cssText = 'font-size:38px;font-weight:900;letter-spacing:-.7px;line-height:1.05;margin-bottom:7px;';

    var slogan = document.createElement('div');
    slogan.textContent = 'Be Local Anywhere';
    slogan.style.cssText = 'font-size:15px;color:rgba(255,255,255,.76);margin-bottom:20px;';

    var status = document.createElement('div');
    status.innerHTML = '<span aria-hidden="true">🔊</span><span>AUDIO ON</span><span style="opacity:.38">•</span><span>ARABIC CAPTIONS ON</span>';
    status.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;padding:8px 12px;border-radius:999px;' +
      'background:rgba(6,13,18,.38);border:1px solid rgba(255,255,255,.12);font-size:10px;font-weight:800;letter-spacing:.7px;color:rgba(255,255,255,.82);margin-bottom:19px;';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<span aria-hidden="true" style="font-size:17px">▶</span><span>START TOUR</span>';
    btn.style.cssText =
      'width:min(270px,100%);height:54px;border:0;border-radius:14px;padding:0 24px;background:#fff;color:#10161a;' +
      'display:inline-flex;align-items:center;justify-content:center;gap:10px;font:900 15px Arial;letter-spacing:1.7px;cursor:pointer;' +
      'box-shadow:0 12px 28px rgba(0,0,0,.22);transition:box-shadow .16s ease,background .16s ease;';

    var hint = document.createElement('div');
    hint.textContent = 'The presentation will wait here until you start it.';
    hint.style.cssText = 'font-size:12px;line-height:1.45;color:rgba(255,255,255,.68);margin-top:15px;';

    var subHint = document.createElement('div');
    subHint.dir = 'rtl';
    subHint.textContent = 'Click START TOUR to begin with audio.';
    subHint.style.cssText = 'font-size:12px;line-height:1.55;color:rgba(255,255,255,.52);margin-top:5px;';

    var errorHint = document.createElement('div');
    errorHint.style.cssText = 'display:none;font-size:12px;color:#ffd0cc;margin-top:10px;';

    box.appendChild(overline);
    box.appendChild(brandImg);
    box.appendChild(brandText);
    box.appendChild(slogan);
    box.appendChild(status);
    box.appendChild(document.createElement('br'));
    box.appendChild(btn);
    box.appendChild(hint);
    box.appendChild(subHint);
    box.appendChild(errorHint);
    gate.appendChild(box);
    document.body.appendChild(gate);
    startGateEl = gate;

    btn.addEventListener('click', function(){
      if (btn.getAttribute('data-starting') === '1') return;
      btn.setAttribute('data-starting','1');
      btn.innerHTML = '<span aria-hidden="true">●</span><span>STARTING…</span>';
      errorHint.style.display = 'none';

      // START TOUR does not release the timeline until the browser confirms
      // that audio has actually been unlocked by this click.
      primeMediaFromGesture().then(function(unlocked){
        if (!unlocked) {
          btn.removeAttribute('data-starting');
          btn.innerHTML = '<span aria-hidden="true" style="font-size:17px">▶</span><span>START TOUR</span>';
          errorHint.textContent = 'Tap START TOUR once more to allow sound.';
          errorHint.style.display = 'block';
          return;
        }

        // A sentence should never be pending here because the entrance
        // timeline is hard-frozen. This branch is only a safety net.
        if (pendingFirstPlay) {
          var rec = pendingFirstPlay;
          pendingFirstPlay = null;
          try {
            rec.audio.loop = false;
            var p = rec.audio.play();
            if (p && p.catch) p.catch(function(){});
          } catch(e) {}
        }

        notifyTourStarted();
        removeStartGate();
      });
    });
  }

  function norm(text){ return String(text || '').replace(/\s+/g,' ').trim(); }

  function stopAudio(){
    serial += 1;
    try {
      var __g = document.querySelector('[data-tour-audio-gate="1"]');
      if (__g && __g.parentNode) __g.parentNode.removeChild(__g);
    } catch(e) {}
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch(e) {}
    }
    activeAudio = null;
    pendingFirstPlay = null;
    chunkSequence = null;
    pendingAmbiguous = null;
    paused = false;
  }

  function finishUtterance(u){
    window.setTimeout(function(){
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
  };
  synth.resume = function(){
    paused = false;
    if (activeAudio) {
      try { var p=activeAudio.play(); if(p&&p.catch)p.catch(function(){}); } catch(e) {}
    }
    try { original.resume(); } catch(e) {}
  };

  function startFullAudio(fullText, consumedText, utterance){
    var map = window.TOUR_AUDIO_MAP || {};
    var item = map[fullText];
    if (!item || !item.file) return false;

    var mySerial = ++serial;
    var audio = sharedAudio;
    try {
      if (!audio) {
        audio = new Audio();
        sharedAudio = audio;
        window.__numeroTourSharedAudio = audio;
      }
      try { audio.pause(); } catch(e) {}
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.loop = false;
      audio.preload = 'auto';
      audio.src = item.file;
      try { audio.currentTime = 0; } catch(e) {}
      try { audio.load(); } catch(e) {}
    } catch(e) {
      return false;
    }
    activeAudio = audio;
    pendingAmbiguous = null;

    var consumed = norm(consumedText);
    if (consumed && fullText.indexOf(consumed) === 0 && consumed !== fullText) {
      chunkSequence = { fullText:fullText, remaining:fullText.slice(consumed.length).replace(/^\s+/, '') };
    } else {
      chunkSequence = null;
    }

    var endedFired = false;
    var endGuard = null;
    var lastAudioTime = 0;
    var lastProgressAt = Date.now();
    function clearEndGuard(){
      if(endGuard){ try{clearInterval(endGuard);}catch(e){} endGuard=null; }
    }
    function clearAudioOnly(){
      clearEndGuard();
      if (mySerial === serial) activeAudio = null;
    }
    function fireEnd(){
      if (endedFired || mySerial !== serial) return;
      endedFired = true;
      clearAudioOnly();
      finishUtterance(utterance);
    }
    function failAndContinue(reason){
      if (endedFired || mySerial !== serial) return;
      endedFired = true;
      try { audio.pause(); } catch(e) {}
      clearAudioOnly();
      chunkSequence=null;
      pendingAmbiguous=null;
      // A broken/missing MP3 must never freeze the presentation. Let the page's
      // existing utterance error handler advance to the next chunk/line.
      if (utterance && typeof utterance.onerror === 'function') {
        try { utterance.onerror({type:'error', error:reason || 'fixed-audio-failed', utterance:utterance}); return; } catch(e) {}
      }
      finishUtterance(utterance);
    }
    function startEndGuard(){
      clearEndGuard();
      lastAudioTime = Number(audio.currentTime) || 0;
      lastProgressAt = Date.now();
      endGuard=setInterval(function(){
        if(endedFired || mySerial!==serial){ clearEndGuard(); return; }
        if(paused || audio.paused) return;
        var d=Number(audio.duration), c=Number(audio.currentTime), now=Date.now();
        if(isFinite(c) && c > lastAudioTime + .02){
          lastAudioTime=c;
          lastProgressAt=now;
        }
        if(audio.ended || (isFinite(d)&&d>0&&isFinite(c)&&c>=Math.max(0,d-.08))){
          fireEnd();
          return;
        }
        // If playback is supposedly running but the playhead does not move for
        // 15 seconds, treat the file as stalled and continue instead of hanging.
        if(now-lastProgressAt>15000){
          failAndContinue('fixed-audio-stalled');
        }
      },250);
    }
    var gateEl = null;

    function fallbackToNativeSpeech(){
      if (endedFired || mySerial !== serial) return;
      endedFired = true;
      clearEndGuard();
      try {
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        audio.pause();
      } catch(e) {}
      if (mySerial === serial) activeAudio = null;

      /*
        If a browser still refuses HTMLAudio after START TOUR, do not interrupt
        the visitor with another permission screen and do not skip the line.
        Speak the SAME full line through the browser's native speech engine.
      */
      try {
        if (typeof window.SpeechSynthesisUtterance === 'function') {
          var nativeUtterance = new SpeechSynthesisUtterance(fullText);
          try { nativeUtterance.voice = utterance && utterance.voice ? utterance.voice : null; } catch(e) {}
          try { nativeUtterance.lang = (utterance && utterance.lang) || 'en-US'; } catch(e) {}
          try { nativeUtterance.rate = (utterance && utterance.rate) || 1; } catch(e) {}
          try { nativeUtterance.pitch = (utterance && utterance.pitch) || 1; } catch(e) {}
          try { nativeUtterance.volume = (utterance && utterance.volume != null) ? utterance.volume : 1; } catch(e) {}

          nativeUtterance.onend = function(){ finishUtterance(utterance); };
          nativeUtterance.onerror = function(){
            if (utterance && typeof utterance.onerror === 'function') {
              try { utterance.onerror({type:'error',error:'native-speech-failed',utterance:utterance}); return; } catch(e) {}
            }
            finishUtterance(utterance);
          };
          original.speak(nativeUtterance);
          return;
        }
      } catch(e) {}

      if (utterance && typeof utterance.onerror === 'function') {
        try { utterance.onerror({type:'error',error:'audio-blocked',utterance:utterance}); return; } catch(e) {}
      }
      finishUtterance(utterance);
    }

    function removeGate(){
      if (gateEl && gateEl.parentNode) {
        try { gateEl.parentNode.removeChild(gateEl); } catch(e) {}
      }
      gateEl = null;
    }

    function showAutoplayGate(){
      if (mySerial !== serial) return;

      // Do NOT call utterance.onend while autoplay is blocked.
      // Holding the utterance here prevents the tour from racing ahead silently.
      if (gateEl && gateEl.parentNode) return;

      gateEl = document.createElement('div');
      gateEl.setAttribute('data-tour-audio-gate','1');
      gateEl.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px;' +
        'background:rgba(4,9,13,.76);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'font-family:Arial,Helvetica,sans-serif;';

      var box = document.createElement('div');
      box.style.cssText =
        'width:min(390px,92vw);padding:28px 28px 24px;border-radius:20px;' +
        'background:linear-gradient(180deg,rgba(18,32,41,.98),rgba(9,18,24,.98));border:1px solid rgba(255,255,255,.16);' +
        'box-shadow:0 24px 70px rgba(0,0,0,.42);text-align:center;color:#fff;';

      var speaker = document.createElement('div');
      speaker.textContent = '🔊';
      speaker.style.cssText = 'width:54px;height:54px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(255,255,255,.10);font-size:24px;border:1px solid rgba(255,255,255,.12);';

      var title = document.createElement('div');
      title.textContent = 'ENABLE AUDIO';
      title.style.cssText = 'font-size:20px;font-weight:900;letter-spacing:1.5px;margin-bottom:8px;';

      var sub = document.createElement('div');
      sub.textContent = 'Tap once to continue this same line with sound. Nothing will be skipped.';
      sub.style.cssText = 'font-size:13px;line-height:1.5;color:rgba(255,255,255,.72);';

      var tap = document.createElement('div');
      tap.textContent = 'TAP TO CONTINUE';
      tap.style.cssText = 'margin:18px auto 0;display:inline-flex;align-items:center;justify-content:center;min-width:190px;height:44px;padding:0 18px;' +
        'border-radius:12px;background:#fff;color:#10161a;font-size:12px;font-weight:900;letter-spacing:1.4px;cursor:pointer;';

      box.appendChild(speaker);
      box.appendChild(title);
      box.appendChild(sub);
      box.appendChild(tap);
      gateEl.appendChild(box);
      document.body.appendChild(gateEl);

      function retry(){
        if (mySerial !== serial) { removeGate(); return; }
        try {
          var again = audio.play();
          if (again && again.then) {
            again.then(function(){
              removeGate();
              if (paused) {
                try { audio.pause(); } catch(e) {}
              }
            }).catch(function(err){
              // Keep the gate visible if the browser still refuses autoplay.
              if (!err || (err.name !== 'NotAllowedError' && err.name !== 'AbortError')) {
                removeGate();
                fallback();
              }
            });
          } else {
            removeGate();
          }
        } catch(e) {
          // Keep waiting for a real user gesture only for autoplay-style failures.
          if (!e || (e.name !== 'NotAllowedError' && e.name !== 'AbortError')) {
            removeGate();
            fallback();
          }
        }
      }

      gateEl.addEventListener('click', retry, {once:false});
      gateEl.addEventListener('touchend', function(ev){ try{ev.preventDefault();}catch(e){} retry(); }, {passive:false});
    }

    function fallback(){
      if (mySerial !== serial) return;
      removeGate();
      failAndContinue('fixed-audio-load-failed');
    }

    audio.onended=function(){ removeGate(); fireEnd(); };
    audio.onerror=fallback;
    audio.onplaying=startEndGuard;

    // On the first page, wait for the explicit START TOUR click.
    // Holding utterance.onend here keeps the tour on the first scene without
    // hijacking any page timers.
    if (isDoorPage && !userStarted) {
      pendingFirstPlay = {
        audio: audio,
        mySerial: mySerial,
        fallback: fallback,
        showGate: showAutoplayGate
      };
      showStartGate();
      return true;
    }

    try {
      var p=audio.play();
      if(paused) audio.pause();
      if(p&&p.catch)p.catch(function(err){
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          if (tourWasStarted) fallbackToNativeSpeech();
          else showAutoplayGate();
        } else {
          fallback();
        }
      });
    } catch(e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
        if (tourWasStarted) fallbackToNativeSpeech();
        else showAutoplayGate();
      } else {
        fallback();
      }
    }
    return true;
  }

  synth.speak = function(utterance){
    var text = norm(utterance && utterance.text);
    var map = window.TOUR_AUDIO_MAP || {};
    var prefixes = window.TOUR_AUDIO_PREFIX || {};
    var multi = window.TOUR_AUDIO_PREFIX_MULTI || {};

    // Full line already spoken: silently consume the remaining browser chunks.
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

    // We deliberately skipped an ambiguous first chunk (e.g. "Exactly.").
    // Add this next chunk until only one complete source line matches, then play that full MP3.
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

    // Not part of the generated tour audio: keep original browser TTS as a safety fallback.
    return original.speak(utterance);
  };


  // Compact control labels: Arabic = ع, Voice = speaker icon only.
  // Muted voice button turns red. Existing page click handlers remain untouched.
  function __readPref(key, fallback){
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v !== '0';
    } catch(e) { return fallback; }
  }

  function __findControl(ids){
    for (var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if (el) return el;
    }
    return null;
  }

  function __styleCompactButton(el){
    if (!el) return;
    try {
      el.style.setProperty('min-width','46px','important');
      el.style.setProperty('width','46px','important');
      el.style.setProperty('padding','0','important');
      el.style.setProperty('font-size','18px','important');
      el.style.setProperty('letter-spacing','0','important');
      el.style.setProperty('display','inline-flex','important');
      el.style.setProperty('align-items','center','important');
      el.style.setProperty('justify-content','center','important');
    } catch(e) {}
  }

  function __syncCompactControls(){
    if (!document.body) return;

    var arBtn = __findControl(['arBtn','arabicToggle','tourArabicToggle']);
    var voiceBtn = __findControl(['voiceBtn','voiceToggle','tourVoiceToggle']);
    var arOn = __readPref('support_center_ar', true);
    var voiceOn = __readPref('support_center_voice', true);

    if (arBtn) {
      __styleCompactButton(arBtn);

      var translateIcon =
        '<span aria-hidden="true" style="position:relative;width:25px;height:22px;display:inline-block;pointer-events:none">' +
          '<span style="position:absolute;right:0;top:1px;width:16px;height:17px;border-radius:3px;background:#eef1f4;border:1px solid #bcc5ce;display:flex;align-items:center;justify-content:center;color:#4d5964;font:700 10px Arial;line-height:1">文</span>' +
          '<span style="position:absolute;left:0;bottom:0;width:17px;height:17px;border-radius:3px;background:#4285f4;display:flex;align-items:center;justify-content:center;color:#fff;font:700 10px Arial;line-height:1;box-shadow:0 1px 2px rgba(0,0,0,.18)">G</span>' +
        '</span>';

      if (arBtn.innerHTML !== translateIcon) arBtn.innerHTML = translateIcon;
      arBtn.setAttribute('aria-label', arOn ? 'Arabic translation on' : 'Arabic translation off');
      arBtn.title = arOn ? 'Arabic translation: ON' : 'Arabic translation: OFF';
      try {
        arBtn.style.setProperty('background', arOn ? '#ffffff' : 'rgba(9,17,23,.76)', 'important');
        arBtn.style.setProperty('color', arOn ? '#152129' : '#ffffff', 'important');
        arBtn.style.setProperty('border-color', arOn ? '#ffffff' : 'rgba(255,255,255,.18)', 'important');
        arBtn.style.setProperty('opacity', arOn ? '1' : '.70', 'important');
      } catch(e) {}
    }

    if (voiceBtn) {
      __styleCompactButton(voiceBtn);
      var icon = voiceOn ? '🔊' : '🔇';
      if (voiceBtn.textContent !== icon) voiceBtn.textContent = icon;
      voiceBtn.setAttribute('aria-label', voiceOn ? 'Mute tour audio' : 'Unmute tour audio');
      voiceBtn.title = voiceOn ? 'Sound: ON' : 'Sound: MUTED';
      try {
        voiceBtn.style.setProperty('background', voiceOn ? 'rgba(9,17,23,.76)' : '#b42318', 'important');
        voiceBtn.style.setProperty('color', '#ffffff', 'important');
        voiceBtn.style.setProperty('border-color', voiceOn ? 'rgba(255,255,255,.18)' : '#ff6b5f', 'important');
      } catch(e) {}
    }
  }

  function __installCompactControls(){
    __syncCompactControls();
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t) return;
      var id = String(t.id || '');
      if (id === 'arBtn' || id === 'arabicToggle' || id === 'tourArabicToggle' ||
          id === 'voiceBtn' || id === 'voiceToggle' || id === 'tourVoiceToggle') {
        window.setTimeout(__syncCompactControls, 60);
      }
    }, true);
    // Some pages update labels asynchronously after rendering; keep the icons normalized.
    window.setInterval(__syncCompactControls, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __installCompactControls, {once:true});
  } else {
    __installCompactControls();
  }

  window.supportTourFixedAudio = { stop:function(){ synth.cancel(); }, usingFixedAudio:true, isActive:function(){return !!activeAudio;}, isPaused:function(){return !!paused;} };

  if (isDoorPage) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showStartGate, {once:true});
    } else {
      showStartGate();
    }
  }

  window.addEventListener('pagehide', function(){ try { synth.cancel(); } catch(e) {} });
  window.addEventListener('beforeunload', function(){ try { synth.cancel(); } catch(e) {} });
})();
