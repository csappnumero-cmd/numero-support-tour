(function(){
  'use strict';
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

  function norm(text){ return String(text || '').replace(/\s+/g,' ').trim(); }

  function stopAudio(){
    serial += 1;
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch(e) {}
    }
    activeAudio = null;
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
    function fallback(){
      if (mySerial !== serial) return;
      clearAudioOnly(); chunkSequence=null; pendingAmbiguous=null;
      try { original.speak(utterance); }
      catch(e) {
        if (utterance && typeof utterance.onerror === 'function') {
          try { utterance.onerror({type:'error', error:e, utterance:utterance}); } catch(ignore) {}
        }
      }
    }
    audio.onended=fireEnd; audio.onerror=fallback;
    try {
      var p=audio.play();
      if(paused) audio.pause();
      if(p&&p.catch)p.catch(fallback);
    } catch(e) { fallback(); }
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

  window.supportTourFixedAudio = { stop:function(){ synth.cancel(); }, usingFixedAudio:true };
  window.addEventListener('pagehide', function(){ try { synth.cancel(); } catch(e) {} });
  window.addEventListener('beforeunload', function(){ try { synth.cancel(); } catch(e) {} });
})();
