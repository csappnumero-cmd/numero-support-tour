from pathlib import Path
import re, shutil, datetime, sys

ROOT = Path(__file__).resolve().parent
STAMP = '20260916-final3'
BACKUP = ROOT / '_backup_before_final_ui_cache_fix'
BACKUP.mkdir(exist_ok=True)

htmls = sorted(ROOT.glob('index*.html'))
if not htmls:
    print('ERROR: No index*.html files found. Put this script in the website folder.')
    sys.exit(1)

# Safe idempotent helper

def backup(path: Path):
    dst = BACKUP / path.name
    if not dst.exists():
        shutil.copy2(path, dst)

def version_url(url: str):
    # Keep external/data URLs untouched.
    if url.startswith(('http://','https://','data:','//')):
        return url
    base = re.sub(r'([?&])v=[^&#"\']+', '', url)
    sep = '&' if '?' in base else '?'
    return base + sep + 'v=' + STAMP

# Inline UI normalizer. It does NOT change tour logic, only button appearance.
UI_SCRIPT = r'''<script id="numero-final-compact-controls">
(function(){
  'use strict';
  var AR_KEY='support_center_ar', VOICE_KEY='support_center_voice';

  function get(ids){
    for(var i=0;i<ids.length;i++){
      var el=document.getElementById(ids[i]);
      if(el) return el;
    }
    return null;
  }
  function compact(el){
    if(!el) return;
    el.style.setProperty('min-width','46px','important');
    el.style.setProperty('width','46px','important');
    el.style.setProperty('height','38px','important');
    el.style.setProperty('padding','0','important');
    el.style.setProperty('font-size','18px','important');
    el.style.setProperty('letter-spacing','0','important');
    el.style.setProperty('display','inline-flex','important');
    el.style.setProperty('align-items','center','important');
    el.style.setProperty('justify-content','center','important');
  }
  function pref(key, fallback){
    try{ var v=localStorage.getItem(key); return v===null?fallback:v==='1'; }
    catch(e){ return fallback; }
  }
  function infer(text, key, fallback){
    text=String(text||'').toUpperCase();
    if(/\bOFF\b/.test(text)) return false;
    if(/\bON\b/.test(text)) return true;
    return pref(key,fallback);
  }
  var trIcon='<span aria-hidden="true" style="position:relative;width:25px;height:22px;display:inline-block;pointer-events:none">'+
    '<span style="position:absolute;right:0;top:1px;width:16px;height:17px;border-radius:3px;background:#eef1f4;border:1px solid #bcc5ce;display:flex;align-items:center;justify-content:center;color:#4d5964;font:700 10px Arial;line-height:1">文</span>'+
    '<span style="position:absolute;left:0;bottom:0;width:17px;height:17px;border-radius:3px;background:#4285f4;display:flex;align-items:center;justify-content:center;color:#fff;font:700 10px Arial;line-height:1;box-shadow:0 1px 2px rgba(0,0,0,.18)">G</span>'+
    '</span>';

  function sync(){
    var ar=get(['arBtn','arabicToggle','tourArabicToggle']);
    var voice=get(['voiceBtn','voiceToggle','tourVoiceToggle']);
    var pause=get(['pauseBtn','pauseToggle','tourPauseToggle']);

    if(ar){
      var raw=ar.getAttribute('data-numero-last-native') || ar.textContent;
      if(/\b(?:AR\s+)?(?:ON|OFF)\b/i.test(ar.textContent||'')){
        raw=ar.textContent; ar.setAttribute('data-numero-last-native',raw);
      }
      var on=infer(raw,AR_KEY,true);
      compact(ar);
      if(ar.innerHTML!==trIcon) ar.innerHTML=trIcon;
      ar.title=on?'Arabic translation: ON':'Arabic translation: OFF';
      ar.setAttribute('aria-label',ar.title);
      ar.style.setProperty('background',on?'#ffffff':'rgba(9,17,23,.78)','important');
      ar.style.setProperty('border-color',on?'#ffffff':'rgba(255,255,255,.18)','important');
      ar.style.setProperty('opacity',on?'1':'.65','important');
    }

    if(voice){
      var vraw=voice.getAttribute('data-numero-last-native') || voice.textContent;
      if(/\bVOICE\s+(?:ON|OFF)\b/i.test(voice.textContent||'')){
        vraw=voice.textContent; voice.setAttribute('data-numero-last-native',vraw);
      }
      var von=infer(vraw,VOICE_KEY,true);
      compact(voice);
      var ico=von?'🔊':'🔇';
      if(voice.textContent!==ico) voice.textContent=ico;
      voice.title=von?'Sound: ON':'Sound: MUTED';
      voice.setAttribute('aria-label',voice.title);
      voice.style.setProperty('background',von?'rgba(9,17,23,.78)':'#b42318','important');
      voice.style.setProperty('border-color',von?'rgba(255,255,255,.18)':'#ff6b5f','important');
      voice.style.setProperty('color','#fff','important');
    }

    if(pause){
      var praw=pause.getAttribute('data-numero-last-native') || pause.textContent;
      if(/PAUSE|PLAY|REPLAY/i.test(pause.textContent||'')){
        praw=pause.textContent; pause.setAttribute('data-numero-last-native',praw);
      }
      compact(pause);
      var picon=/PLAY/i.test(praw)?'▶️':(/REPLAY/i.test(praw)?'↻':'⏸️');
      if(pause.textContent!==picon) pause.textContent=picon;
      pause.title=picon==='▶️'?'Play':(picon==='↻'?'Replay':'Pause');
      pause.setAttribute('aria-label',pause.title);
    }
  }

  function install(){
    sync();
    document.addEventListener('click',function(e){
      var id=(e.target&&e.target.id)||'';
      if(/^(arBtn|arabicToggle|tourArabicToggle|voiceBtn|voiceToggle|tourVoiceToggle|pauseBtn|pauseToggle|tourPauseToggle)$/.test(id)){
        setTimeout(sync,80);
        setTimeout(sync,250);
      }
    },true);
    setInterval(sync,700);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
</script>'''

RESET_SCRIPT = r'''<script id="numero-fresh-start-defaults">
(function(){
  try{
    // Every new visit through index.html begins clean: Arabic ON, sound ON.
    localStorage.setItem('support_center_ar','1');
    localStorage.setItem('support_center_voice','1');
  }catch(e){}
})();
</script>'''

META = '''\n  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">'''

changed=[]
for p in htmls:
    s=p.read_text(encoding='utf-8',errors='ignore')
    orig=s
    backup(p)

    # HTML-level revalidation hints.
    if 'http-equiv="Cache-Control"' not in s:
        s=s.replace('</head>', META+'\n</head>',1)

    # Version local JS/CSS references so stale GitHub/browser cache cannot keep old runtime/data.
    def repl_src(m):
        q=m.group(1); url=m.group(2)
        if any(x in url for x in ['tour-data.js','tour-runtime.js','tour-audio.js','tour-audio-map.js','tour-runtime.css']):
            return 'src='+q+version_url(url)+q
        return m.group(0)
    s=re.sub(r'src=(["\'])([^"\']+)\1', repl_src, s, flags=re.I)
    def repl_href(m):
        q=m.group(1); url=m.group(2)
        if any(x in url for x in ['tour-runtime.css']):
            return 'href='+q+version_url(url)+q
        return m.group(0)
    s=re.sub(r'href=(["\'])([^"\']+)\1', repl_href, s, flags=re.I)

    # Arabic fallback must be ON if no preference exists.
    s=re.sub(r"safeGet\(AR_KEY,\s*'0'\)", "safeGet(AR_KEY,'1')", s)
    s=re.sub(r'safeGet\(AR_KEY,\s*"0"\)', 'safeGet(AR_KEY,"1")', s)

    # Fresh defaults only on the entry page.
    if p.name.lower()=='index.html' and 'numero-fresh-start-defaults' not in s:
        s=s.replace('</head>', RESET_SCRIPT+'\n</head>',1)

    # Icon-only controls on every page.
    if 'numero-final-compact-controls' not in s:
        s=s.replace('</body>', UI_SCRIPT+'\n</body>',1)

    if s!=orig:
        p.write_text(s,encoding='utf-8')
        changed.append(p.name)

# Patch runtime dynamic tour-audio reference if present.
for name in ['tour-runtime.js','tour-audio.js','tour-audio-map.js','tour-data.js']:
    p=ROOT/name
    if not p.exists():
        continue
    backup(p)
    s=p.read_text(encoding='utf-8',errors='ignore')
    orig=s
    # Any literal tour-audio.js dynamically loaded becomes versioned.
    s=re.sub(r"tour-audio\.js(?:\?v=[A-Za-z0-9._-]+)?", f"tour-audio.js?v={STAMP}", s)
    if s!=orig:
        p.write_text(s,encoding='utf-8')
        changed.append(name)

# Build marker helps verify the new deployment in source if needed.
(ROOT/'BUILD_VERSION.txt').write_text(STAMP+'\n',encoding='utf-8')

print('FINAL UI + FRESH START PATCH COMPLETE')
print('Build version:',STAMP)
print('Changed files:',len(changed))
for n in changed: print(' OK',n)
print('Backup folder:',BACKUP.name)
print('Next: Commit these changes and Push origin.')
