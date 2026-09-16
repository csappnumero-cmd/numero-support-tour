from pathlib import Path
import re, shutil

root = Path(__file__).resolve().parent
build = '20260916-controls-v3'
backup = root / '_backup_before_icon_controls_v3'
backup.mkdir(exist_ok=True)

control_script = """<script id=\"numero-icon-controls-v3\">
(function(){
  'use strict';
  var AR_IDS=['arBtn','arabicToggle','tourArabicToggle'];
  var VOICE_IDS=['voiceBtn','voiceToggle','tourVoiceToggle'];
  var PAUSE_IDS=['pauseBtn','pauseToggle','tourPauseToggle'];

  function firstByIds(ids){
    for(var i=0;i<ids.length;i++){
      var el=document.getElementById(ids[i]);
      if(el) return el;
    }
    return null;
  }

  function forceBaseStyle(btn){
    if(!btn) return;
    btn.style.setProperty('width','46px','important');
    btn.style.setProperty('min-width','46px','important');
    btn.style.setProperty('height','38px','important');
    btn.style.setProperty('padding','0','important');
    btn.style.setProperty('display','inline-flex','important');
    btn.style.setProperty('align-items','center','important');
    btn.style.setProperty('justify-content','center','important');
    btn.style.setProperty('font-size','18px','important');
    btn.style.setProperty('letter-spacing','0','important');
    btn.style.setProperty('line-height','1','important');
  }

  var translateIcon =
    '<span class=\"numero-translate-icon\" aria-hidden=\"true\" style=\"position:relative;width:25px;height:22px;display:inline-block;pointer-events:none\">' +
      '<span style=\"position:absolute;right:0;top:1px;width:16px;height:17px;border-radius:3px;background:#eef1f4;border:1px solid #bcc5ce;display:flex;align-items:center;justify-content:center;color:#4d5964;font:700 10px Arial;line-height:1\">文</span>' +
      '<span style=\"position:absolute;left:0;bottom:0;width:17px;height:17px;border-radius:3px;background:#4285f4;display:flex;align-items:center;justify-content:center;color:#fff;font:700 10px Arial;line-height:1;box-shadow:0 1px 2px rgba(0,0,0,.18)\">G</span>' +
    '</span>';

  function decorateArabic(){
    var b=firstByIds(AR_IDS); if(!b) return;
    var raw=(b.textContent||'').trim().toUpperCase();
    if(raw.indexOf('AR ON')>=0) b.dataset.numeroAr='on';
    else if(raw.indexOf('AR OFF')>=0) b.dataset.numeroAr='off';
    if(!b.dataset.numeroAr) b.dataset.numeroAr=(b.classList.contains('active')||b.classList.contains('on'))?'on':'off';
    forceBaseStyle(b);
    if(!b.querySelector('.numero-translate-icon')) b.innerHTML=translateIcon;
    var on=b.dataset.numeroAr==='on';
    b.title=on?'Arabic translation: ON':'Arabic translation: OFF';
    b.setAttribute('aria-label',b.title);
    b.style.setProperty('background',on?'#ffffff':'rgba(9,17,23,.76)','important');
    b.style.setProperty('border-color',on?'#ffffff':'rgba(255,255,255,.18)','important');
    b.style.setProperty('opacity',on?'1':'.62','important');
  }

  function decorateVoice(){
    var b=firstByIds(VOICE_IDS); if(!b) return;
    var raw=(b.textContent||'').trim().toUpperCase();
    if(raw.indexOf('VOICE ON')>=0 || raw==='🔊') b.dataset.numeroMuted='0';
    else if(raw.indexOf('VOICE OFF')>=0 || raw==='🔇') b.dataset.numeroMuted='1';
    if(!b.dataset.numeroMuted) b.dataset.numeroMuted=(b.classList.contains('active')||b.classList.contains('on'))?'0':'1';
    forceBaseStyle(b);
    var muted=b.dataset.numeroMuted==='1';
    var icon=muted?'🔇':'🔊';
    if(b.textContent!==icon) b.textContent=icon;
    b.title=muted?'Audio muted':'Audio on';
    b.setAttribute('aria-label',b.title);
    b.style.setProperty('background',muted?'#c62828':'rgba(9,17,23,.82)','important');
    b.style.setProperty('border-color',muted?'#ff6b6b':'rgba(255,255,255,.18)','important');
    b.style.setProperty('color','#ffffff','important');
  }

  function decoratePause(){
    var b=firstByIds(PAUSE_IDS); if(!b) return;
    var raw=(b.textContent||'').trim().toUpperCase();
    if(raw.indexOf('REPLAY')>=0 || raw==='↻') b.dataset.numeroAction='replay';
    else if(raw.indexOf('PLAY')>=0 || raw==='▶' || raw==='▶️') b.dataset.numeroAction='play';
    else if(raw.indexOf('PAUSE')>=0 || raw==='⏸' || raw==='⏸️') b.dataset.numeroAction='pause';
    if(!b.dataset.numeroAction) b.dataset.numeroAction='pause';
    forceBaseStyle(b);
    var action=b.dataset.numeroAction;
    var icon=action==='play'?'▶':(action==='replay'?'↻':'⏸');
    if(b.textContent!==icon) b.textContent=icon;
    b.title=action==='play'?'Play':(action==='replay'?'Replay':'Pause');
    b.setAttribute('aria-label',b.title);
  }

  var queued=false;
  function decorateAll(){ queued=false; decorateArabic(); decorateVoice(); decoratePause(); }
  function queueDecorate(){ if(queued) return; queued=true; Promise.resolve().then(decorateAll); }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',decorateAll,{once:true});
  else decorateAll();

  var obs=new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      var t=mutations[i].target;
      if(t && t.nodeType===3) t=t.parentElement;
      if(!t) continue;
      var btn=(t.tagName==='BUTTON')?t:(t.closest?t.closest('button'):null);
      var id=btn?btn.id:'';
      if(AR_IDS.indexOf(id)>=0 || VOICE_IDS.indexOf(id)>=0 || PAUSE_IDS.indexOf(id)>=0){ queueDecorate(); return; }
    }
  });
  if(document.body) obs.observe(document.body,{subtree:true,childList:true,characterData:true});
})();
</script>"""

fresh_script = """<script id=\"numero-fresh-start-v3\">
(function(){
  try {
    localStorage.setItem('support_center_ar','1');
    localStorage.setItem('support_center_voice','1');
  } catch(e) {}
})();
</script>"""

changed=[]
for path in sorted(root.glob('index*.html')):
    txt=path.read_text(encoding='utf-8', errors='ignore')
    orig=txt
    shutil.copy2(path, backup/path.name)

    txt=re.sub(r'<script id="numero-icon-controls-v3">.*?</script>','',txt,flags=re.S)
    txt=re.sub(r'<script id="numero-fresh-start-v3">.*?</script>','',txt,flags=re.S)

    for asset in ['tour-audio.js','tour-audio-map.js','tour-data.js','tour-runtime.js','tour-runtime.css']:
        pat=r'(["\'])'+re.escape(asset)+r'(?:\?v=[^"\']*)?\1'
        txt=re.sub(pat, lambda m: m.group(1)+asset+'?v='+build+m.group(1), txt)

    if 'http-equiv="Cache-Control"' not in txt and '<head>' in txt:
        txt=txt.replace('<head>','<head>\n  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">',1)

    if path.name.lower()=='index.html' and '<head>' in txt:
        pos=txt.find('<head>')+len('<head>')
        txt=txt[:pos]+'\n'+fresh_script+txt[pos:]

    if '</body>' in txt:
        txt=txt.replace('</body>',control_script+'\n</body>',1)
    else:
        txt += '\n'+control_script+'\n'

    if txt!=orig:
        path.write_text(txt, encoding='utf-8')
        changed.append(path.name)

print('ICON BUTTONS + FRESH START PATCH COMPLETE')
print('Build:', build)
print('Changed files:', len(changed))
for n in changed: print(' OK', n)
print('Backup folder:', backup.name)
print('Next: move the backup folder outside the repository, then Commit and Push.')
