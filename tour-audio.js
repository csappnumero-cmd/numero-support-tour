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
  if (!window.speechSynthesis || window.__tourFixedAudioInstalled) return;
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
  // We intentionally do NOT intercept setTimeout/setInterval here.
  var fileName = (window.location.pathname.split('/').pop() || '').toLowerCase();
  var isDoorPage = !fileName || fileName === 'index.html';
  var userStarted = !isDoorPage;
  var startGateEl = null;
  var pendingFirstPlay = null;

  function removeStartGate(){
    if (startGateEl && startGateEl.parentNode) {
      try { startGateEl.parentNode.removeChild(startGateEl); } catch(e) {}
    }
    startGateEl = null;
  }

  function showStartGate(){
    if (!isDoorPage || userStarted || startGateEl || !document.body) return;

    var gate = document.createElement('div');
    gate.setAttribute('data-tour-start-gate','1');
    gate.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;' +
      'background:radial-gradient(circle at top,rgba(58,137,255,.22),transparent 32%),' +
      'linear-gradient(135deg,#0a1a24 0%,#102634 48%,#081118 100%);' +
      'font-family:Arial,Helvetica,sans-serif;color:#fff;overflow:hidden;';

    var glow1 = document.createElement('div');
    glow1.style.cssText = 'position:absolute;width:420px;height:420px;border-radius:50%;left:-120px;top:-120px;background:radial-gradient(circle,rgba(0,194,255,.20),transparent 68%);filter:blur(18px);pointer-events:none;';
    var glow2 = document.createElement('div');
    glow2.style.cssText = 'position:absolute;width:460px;height:460px;border-radius:50%;right:-150px;bottom:-150px;background:radial-gradient(circle,rgba(197,34,255,.20),transparent 68%);filter:blur(18px);pointer-events:none;';

    var box = document.createElement('div');
    box.style.cssText =
      'position:relative;width:min(620px,92vw);padding:36px 32px 30px;border-radius:26px;text-align:center;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.08));' +
      'border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
      'box-shadow:0 30px 90px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.12);';

    function detectLogoSrc(){
      try {
        if (window.TOUR_DATA && window.TOUR_DATA.logo_url) return window.TOUR_DATA.logo_url;
      } catch(e) {}
      try {
        var preload = document.querySelector('link[rel="preload"][as="image"][href]');
        if (preload && preload.href) return preload.href;
      } catch(e) {}
      try {
        var headerLogo = document.querySelector('img[src*="logo"], img[src*="numero"], img[src*="imgur"], .logo img, [class*="logo"] img');
        if (headerLogo && headerLogo.src) return headerLogo.src;
      } catch(e) {}
      return 'https://i.imgur.com/Q5DSMWO.png';
    }

    var overline = document.createElement('div');
    overline.textContent = 'NUMERO SUPPORT TOUR';
    overline.style.cssText = 'font-size:12px;font-weight:800;letter-spacing:3px;color:rgba(255,255,255,.72);margin-bottom:18px;';

    var brandWrap = document.createElement('div');
    brandWrap.style.cssText = 'display:flex;flex-direction:column;justify-content:center;align-items:center;margin-bottom:24px;';

    var brandImg = document.createElement('img');
    brandImg.src = detectLogoSrc();
    brandImg.alt = 'Numero eSIM';
    brandImg.style.cssText = 'max-width:min(340px,76vw);max-height:120px;width:auto;height:auto;display:block;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(0,0,0,.28));margin-bottom:14px;';

    var brandText = document.createElement('div');
    brandText.textContent = 'Numero eSIM';
    brandText.style.cssText = 'font-size:38px;font-weight:900;letter-spacing:-1px;line-height:1.05;margin-bottom:8px;';

    var slogan = document.createElement('div');
    slogan.textContent = 'Be Local Anywhere';
    slogan.style.cssText = 'font-size:16px;color:rgba(255,255,255,.82);margin-bottom:2px;';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'START TOUR';
    btn.style.cssText =
      'border:0;border-radius:14px;padding:16px 30px;background:#fff;color:#111;' +
      'font:900 15px Arial;letter-spacing:1.8px;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.18);';

    var hint = document.createElement('div');
    hint.textContent = 'Click once to start the presentation with audio';
    hint.style.cssText = 'font-size:12px;color:rgba(255,255,255,.68);margin-top:14px;';

    var subHint = document.createElement('div');
    subHint.textContent = 'Arabic captions start ON by default and can be turned off anytime';
    subHint.style.cssText = 'font-size:11px;color:rgba(255,255,255,.50);margin-top:8px;';

    brandWrap.appendChild(brandImg);
    brandWrap.appendChild(brandText);
    brandWrap.appendChild(slogan);
    box.appendChild(overline);
    box.appendChild(brandWrap);
    box.appendChild(btn);
    box.appendChild(hint);
    box.appendChild(subHint);
    gate.appendChild(glow1);
    gate.appendChild(glow2);
    gate.appendChild(box);
    document.body.appendChild(gate);
    startGateEl = gate;

    btn.addEventListener('click', function(){
      userStarted = true;
      removeStartGate();

      if (pendingFirstPlay) {
        var rec = pendingFirstPlay;
        pendingFirstPlay = null;
        if (rec.mySerial === serial) {
          try {
            var p = rec.audio.play();
            if (p && p.catch) p.catch(function(err){
              if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
                rec.showGate();
              } else {
                rec.fallback();
              }
            });
          } catch(e) {
            if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) rec.showGate();
            else rec.fallback();
          }
        }
      }
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
    var audio = new Audio(item.file);
    audio.preload = 'auto';
    activeAudio = audio;
    pendingAmbiguous = null;

    var consumed = norm(consumedText);
    if (consumed && fullText.indexOf(consumed) === 0 && consumed !== fullText) {
      chunkSequence = { fullText:fullText, remaining:fullText.slice(consumed.length).replace(/^\s+/, '') };
    } else {
      chunkSequence = null;
    }

    function clearAudioOnly(){ if (mySerial === serial) activeAudio = null; }
    function fireEnd(){
      if (mySerial !== serial) return;
      clearAudioOnly();
      finishUtterance(utterance);
    }
    var gateEl = null;

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
        'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(4,9,13,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'font-family:Arial,Helvetica,sans-serif;cursor:pointer;';

      var box = document.createElement('div');
      box.style.cssText =
        'min-width:280px;max-width:88vw;padding:22px 28px;border-radius:18px;' +
        'background:rgba(12,22,29,.96);border:1px solid rgba(255,255,255,.18);' +
        'box-shadow:0 24px 70px rgba(0,0,0,.38);text-align:center;color:#fff;';

      var title = document.createElement('div');
      title.textContent = 'START TOUR';
      title.style.cssText = 'font-size:22px;font-weight:900;letter-spacing:2px;margin-bottom:8px;';

      var sub = document.createElement('div');
      sub.textContent = 'Click once to enable presentation audio';
      sub.style.cssText = 'font-size:13px;line-height:1.45;color:rgba(255,255,255,.76);';

      box.appendChild(title);
      box.appendChild(sub);
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
      clearAudioOnly(); chunkSequence=null; pendingAmbiguous=null;
      try { original.speak(utterance); }
      catch(e) {
        if (utterance && typeof utterance.onerror === 'function') {
          try { utterance.onerror({type:'error', error:e, utterance:utterance}); } catch(ignore) {}
        }
      }
    }

    audio.onended=function(){ removeGate(); fireEnd(); };
    audio.onerror=fallback;

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
        // Normal browsers may still block autoplay on later pages.
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          showAutoplayGate();
        } else {
          fallback();
        }
      });
    } catch(e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) showAutoplayGate();
      else fallback();
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

  window.supportTourFixedAudio = { stop:function(){ synth.cancel(); }, usingFixedAudio:true };

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
