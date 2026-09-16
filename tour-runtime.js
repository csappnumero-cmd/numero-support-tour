(function(){
  'use strict';

  var DATA = window.TOUR_DATA || {};
  var PAGE_LIST = [
    ['index','Entrance'],['index1','Office'],['index2','Support Manager'],['index2_1','Senior Management'],
    ['index3','Assistant Head'],['index4','Quality Manager'],['index5','Quality Team'],['index6','Management Structure'],
    ['index7','Supervisor'],['index8','Team Leaders'],['index10','Employees'],['index9','OPDC Committee'],
    ['index11','Trainees / Training Journey'],['index12','AI Integration'],['index13','Final Chapter'],['index14','Guest Farewell']
  ];

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function currentPage(){
    var name=(location.pathname.split('/').pop()||'index.html').replace(/\.html?$/i,'');
    return name || 'index';
  }
  var ACTIVE_PAGE=currentPage();
  try{ document.documentElement.setAttribute('data-tour-page',ACTIVE_PAGE); }catch(e){}

  function normalizeImageUrl(value){
    var raw=clean(value); if(!raw) return '';
    if(raw.indexOf('drive.google.com')>=0){
      var m=raw.match(/\/d\/([A-Za-z0-9_-]+)/)||raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
      if(m&&m[1]) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w2000';
    }
    return raw;
  }
  function splitImages(primary,extra){
    var out=[];
    function add(v){
      clean(v).split(/[\n,;|]+/).map(clean).filter(Boolean).forEach(function(u){
        u=normalizeImageUrl(u); if(u && out.indexOf(u)<0) out.push(u);
      });
    }
    add(primary); add(extra); return out;
  }
  function enabled(v){
    if(v===false) return false;
    var s=clean(v).toLowerCase(); return !(s==='false'||s==='0'||s==='no');
  }
  function num(v,fallback){ var n=Number(v); return Number.isFinite(n)?n:fallback; }
  function stopSpeech(){
    try{ if(window.speechSynthesis){ window.speechSynthesis.cancel(); } }catch(e){}
  }
  function hardStopSpeech(){
    /* Stop both the browser engine and the active page-level voice queue.
       This is used before CONTINUE TOUR so system narration can never hold
       the next part of the presentation hostage. */
    try{
      if(typeof window.supportTourStopPageVoice==='function'){
        window.supportTourStopPageVoice();
      }
    }catch(e){}
    try{
      if(typeof window.supportTourStopSystemSpeech==='function'){
        window.supportTourStopSystemSpeech();
      }
    }catch(e){}
    stopSpeech();
  }
  function navigate(page,options){
    page=clean(page)||'index';
    hardStopSpeech();
    var epoch=Date.now();
    try{ sessionStorage.setItem('numero_tour_nav_epoch',String(epoch)); }catch(e){}
    var target=page+'.html?nav='+epoch;
    if(options&&options.dev) target+='&dev=1';
    if((location.pathname.split('/').pop()||'')===(page+'.html')) location.replace(target);
    else location.assign(target);
  }

  window.SupportTourShared={page:ACTIVE_PAGE,normalizeImageUrl:normalizeImageUrl,stopSpeech:stopSpeech,hardStopSpeech:hardStopSpeech,navigate:navigate};
  window.addEventListener('pagehide',hardStopSpeech);
  window.addEventListener('beforeunload',hardStopSpeech);

  /* Capture CONTINUE TOUR before page-specific handlers run.  The visual
     transition still belongs to the page; this only kills the old system
     narration/queue immediately. */
  function isContinueTourTarget(target){
    if(!target || !target.closest) return false;
    var el=target.closest('button,a,[role="button"]');
    if(!el) return false;
    var id=clean(el.id).toLowerCase();
    var cls=clean(el.className).toLowerCase();
    var text=clean(el.textContent).replace(/\s+/g,' ').toUpperCase();
    return id==='continuetour' || cls.indexOf('continue-tour')>=0 || text==='CONTINUE TOUR';
  }
  document.addEventListener('pointerdown',function(event){
    if(isContinueTourTarget(event.target)) hardStopSpeech();
  },true);
  document.addEventListener('keydown',function(event){
    if((event.key==='Enter'||event.key===' ') && isContinueTourTarget(event.target)) hardStopSpeech();
  },true);

  /* ---------------- Stable US-English browser voice casting ----------------
     One speaker_key = one stable voice across the whole site.  We prefer
     en-US voices, favor Natural/Online/Enhanced voices when the browser
     exposes them, and save the exact voice name/URI in localStorage.
     This keeps management and recurring characters consistent from page
     to page while still giving visitor/team pools different voices. */
  var VOICE_MAP_KEY='numero_support_voice_map_us_v9_fixed_management';

  var femaleTokens=[
    'jenny','aria','ava','emma','michelle','sonia','libby','susan','karen','victoria','fiona','tessa','moira','natasha',
    'neerja','heera','joanna','salli','kimberly','kendra','ivy','zira','samantha','ana','amber','elizabeth','ashley',
    'monica','nancy','jane','linda','mary','sara','sarah','olivia','allison','angela','catherine','laura','lisa'
  ];
  var maleTokens=[
    'guy','christopher','eric','roger','brian','davis','david','mark','ryan','george','daniel','james','matthew','andrew',
    'thomas','tom','richard','charles','joey','justin','kevin','russell','arthur','aaron','brandon','jacob','jason','john',
    'michael','paul','robert','steven','william','fred','alex'
  ];

  /* Per-role preferences are only preferences.  If a preferred voice is not
     installed, the allocator picks the best available US voice of the same
     gender.  Assistant Head gets first pick because it is the user's main
     recurring character. */
  var preferredBySpeaker={
    assistant_head:['christopher online','christopher','andrew online','andrew','brian online','brian','david','mark'],
    support_manager:['guy online','guy','davis online','davis','roger online','roger','brian online','brian','david','mark'],
    quality_manager:['eric online','eric','ryan online','ryan','jason online','jason','david','mark','george'],
    ai_employee:['eric online','eric','christopher','andrew','brian','roger'],

    visitor_female_01:['jenny online','jenny','aria online','aria','zira'],
    visitor_female_02:['aria online','aria','ava online','ava','samantha'],
    visitor_female_03:['michelle online','michelle','emma online','emma','zira'],
    visitor_male_01:['christopher online','christopher','guy online','guy','david'],
    visitor_male_02:['eric online','eric','roger online','roger','mark'],
    visitor_male_03:['andrew online','andrew','brian online','brian','davis'],

    quality_member_male_01:['brian online','brian','andrew','mark'],
    quality_member_female_01:['ava online','ava','jenny','zira'],
    quality_member_female_02:['emma online','emma','michelle','samantha'],

    opdc_chair:['jenny online','jenny','aria','zira'],
    opdc_vice_chair:['aria online','aria','michelle','samantha'],
    team_leader_social_media:['jenny','aria','zira'],
    team_leader_data:['aria','ava','samantha'],
    team_leader_reputation_behavior:['michelle','emma','zira'],
    team_leader_subscriptions:['ava','jenny','samantha'],
    team_leader_user_account:['emma','michelle','zira']
  };

  function getStoredMap(){
    try{ var x=JSON.parse(localStorage.getItem(VOICE_MAP_KEY)||'{}'); return x&&typeof x==='object'?x:{}; }catch(e){ return {}; }
  }
  function saveMap(map){ try{ localStorage.setItem(VOICE_MAP_KEY,JSON.stringify(map)); }catch(e){} }
  function voiceId(v){ return clean(v&&v.voiceURI)||clean(v&&v.name); }
  function voiceText(v){ return (clean(v&&v.name)+' '+clean(v&&v.voiceURI)+' '+clean(v&&v.lang)).toLowerCase(); }
  function sortVoices(list){
    return (list||[]).slice().sort(function(a,b){
      var A=(clean(a.lang)+'|'+clean(a.name)+'|'+voiceId(a)).toLowerCase();
      var B=(clean(b.lang)+'|'+clean(b.name)+'|'+voiceId(b)).toLowerCase();
      return A.localeCompare(B);
    });
  }
  function usEnglishVoices(list){
    var us=(list||[]).filter(function(v){ return /^en[-_]us\b/i.test(clean(v.lang)); });
    if(us.length) return us;
    var english=(list||[]).filter(function(v){ return /^en\b/i.test(clean(v.lang)); });
    return english.length?english:(list||[]);
  }
  function reliableLocalVoices(list){
    /* Chromium/Windows can expose some online voices that exist in the list
       but occasionally fail to produce audio. For visitor casting, prefer
       localService voices first so the dialogue always speaks. */
    var local=(list||[]).filter(function(v){ return v && v.localService !== false; });
    return local.length?local:(list||[]);
  }
  function tokenMatch(v,tokens){
    var text=voiceText(v);
    return (tokens||[]).some(function(t){ return text.indexOf(String(t).toLowerCase())>=0; });
  }
  function genderPool(list,gender){
    var tokens=gender==='female'?femaleTokens:maleTokens;
    var matched=(list||[]).filter(function(v){ return tokenMatch(v,tokens); });
    return matched.length?matched:(list||[]);
  }
  function expandedGenderPool(list,gender){
    /* Prefer voices whose names clearly match the requested gender.  If the
       browser only labels one such voice, add unclassified US-English voices
       so different visitor identities do not all collapse to the same voice. */
    var own=gender==='female'?femaleTokens:maleTokens;
    var other=gender==='female'?maleTokens:femaleTokens;
    var matched=(list||[]).filter(function(v){ return tokenMatch(v,own); });
    var unknown=(list||[]).filter(function(v){ return !tokenMatch(v,own) && !tokenMatch(v,other); });
    var opposite=(list||[]).filter(function(v){ return tokenMatch(v,other); });
    return matched.concat(unknown,opposite);
  }
  function qualityScore(v){
    var t=voiceText(v),score=0;
    if(t.indexOf('natural')>=0)score+=60;
    if(t.indexOf('online')>=0)score+=35;
    if(t.indexOf('premium')>=0)score+=30;
    if(t.indexOf('enhanced')>=0)score+=24;
    if(t.indexOf('microsoft')>=0)score+=10;
    if(t.indexOf('google')>=0)score+=8;
    if(/^en[-_]us\b/i.test(clean(v.lang)))score+=20;
    return score;
  }
  function preferenceScore(v,speakerKey){
    var prefs=preferredBySpeaker[speakerKey]||[],text=voiceText(v);
    for(var i=0;i<prefs.length;i++){
      if(text.indexOf(prefs[i])>=0) return 1000-(i*25);
    }
    return 0;
  }
  function waitForVoices(){
    return new Promise(function(resolve){
      if(!('speechSynthesis' in window)){ resolve([]); return; }
      var done=false, tries=0;
      function finish(list){ if(done)return; done=true; resolve(sortVoices(list||[])); }
      function check(){
        var list=[]; try{ list=window.speechSynthesis.getVoices()||[]; }catch(e){}
        if(list.length){ finish(list); return; }
        tries+=1; if(tries>=24){ finish(list); return; }
        setTimeout(check,100);
      }
      try{
        window.speechSynthesis.addEventListener('voiceschanged',function once(){
          var list=window.speechSynthesis.getVoices()||[]; if(list.length) finish(list);
        },{once:true});
      }catch(e){}
      check();
    });
  }
  function baseVoiceProfiles(){
    return (DATA.Voices||[]).filter(function(p){return p && clean(p.speaker_key) && enabled(p.enabled);}).map(function(p){
      var key=clean(p.speaker_key);
      var rate=num(p.rate,1),pitch=num(p.pitch,1);
      /* A slightly calmer, more formal delivery for the three management
         voices.  This does not alter any dialogue text or timing logic. */
      if(key==='assistant_head'){ rate=.94; pitch=.96; }
      else if(key==='support_manager'){ rate=.92; pitch=.91; }
      else if(key==='quality_manager'){ rate=.94; pitch=.92; }
      /* Make the six visitor identities audibly distinct even on browsers
         that expose only a small set of US-English voices. */
      else if(key==='visitor_female_01'){ rate=.94; pitch=1.08; }
      else if(key==='visitor_female_02'){ rate=1.03; pitch=1.01; }
      else if(key==='visitor_female_03'){ rate=.98; pitch=1.13; }
      else if(key==='visitor_male_01'){ rate=.95; pitch=.90; }
      else if(key==='visitor_male_02'){ rate=1.03; pitch=.98; }
      else if(key==='visitor_male_03'){ rate=.92; pitch=.86; }
      return {
        speaker_key:key, group_key:clean(p.group_key), title:clean(p.title)||key,
        gender:(clean(p.gender).toLowerCase()==='female'?'female':'male'), lang:'en-US',
        voice_hint:clean(p.voice_hint), rate:rate, pitch:pitch, enabled:true
      };
    });
  }

  function visitorAliasForPage(){
    /* Keep the page-facing key as `visitor` for compatibility with every
       existing index, but cast that alias to a different reliable US voice
       depending on the chapter. */
    var byPage={
      index2:'visitor_female_01',
      index2_1:'visitor_female_01',
      index3:'visitor_female_02',
      index4:'visitor_female_03',
      index5:'visitor_male_01',
      index6:'visitor_female_02',
      index7:'visitor_male_02',
      index8:'visitor_male_03',
      index9:'visitor_male_02',
      index10:'visitor_female_01',
      index11:'visitor_female_02',
      index12:'visitor_female_03',
      index13:'visitor_male_01',
      index14:'visitor_female_03'
    };
    return byPage[ACTIVE_PAGE]||'visitor_female_01';
  }
  function aliasMapForPage(){
    return {
      visitor:visitorAliasForPage(),
      quality_team:'quality_member_female_01',
      supervisor:'supervisor_male_01',
      team_leaders:'team_leader_social_media',
      opdc:'opdc_chair',
      employees:'employee_male_01',
      trainee:'trainee_male_01',
      trainees:'trainee_male_01'
    };
  }

  var voiceProfilesPromise=null;
  function stableVoiceProfiles(){
    if(voiceProfilesPromise) return voiceProfilesPromise;
    voiceProfilesPromise=waitForVoices().then(function(all){
      var profiles=baseVoiceProfiles();
      var stored=getStoredMap();
      var available=usEnglishVoices(all);
      var validById={}, validByName={};
      all.forEach(function(v){ validById[voiceId(v)]=v; validByName[clean(v.name).toLowerCase()]=v; });
      var map={},used={};

      /* Give recurring management characters first choice, then AI, then the
         rest.  With enough installed voices, each visitor/team member gets a
         distinct voice.  When the OS has fewer voices, reuse is deterministic
         and rate/pitch still remain fixed per character. */
      var priority={support_manager:0,assistant_head:1,quality_manager:2,ai_employee:3};
      var allocation=profiles.slice().sort(function(a,b){
        var pa=Object.prototype.hasOwnProperty.call(priority,a.speaker_key)?priority[a.speaker_key]:50;
        var pb=Object.prototype.hasOwnProperty.call(priority,b.speaker_key)?priority[b.speaker_key]:50;
        if(pa!==pb)return pa-pb;
        return a.speaker_key.localeCompare(b.speaker_key);
      });

      allocation.forEach(function(p){
        var old=stored[p.speaker_key];
        var oldVoice=old && (validById[clean(old.voiceURI)] || validByName[clean(old.name).toLowerCase()]);
        var isVisitor=/^visitor_(female|male)_\d+$/i.test(p.speaker_key);
        if(oldVoice && usEnglishVoices([oldVoice]).length && (!isVisitor || oldVoice.localService !== false)){
          map[p.speaker_key]={voiceURI:voiceId(oldVoice),name:clean(oldVoice.name)};
          used[voiceId(oldVoice)]=(used[voiceId(oldVoice)]||0)+1;
          return;
        }

        var visitorAvailable=isVisitor?reliableLocalVoices(available):available;
        var pool=isVisitor?expandedGenderPool(visitorAvailable,p.gender):genderPool(available,p.gender);
        if(!pool.length) pool=(isVisitor?reliableLocalVoices(available):available);
        if(!pool.length) pool=all;
        if(!pool.length) return;

        var ranked=pool.slice().sort(function(a,b){
          /* Visitor identities must be different first, preferred-name second.
             This prevents three female visitors from all becoming Zira merely
             because Zira is the only voice whose name our gender list knows. */
          var reusePenalty=isVisitor?3500:900;
          var sa=preferenceScore(a,p.speaker_key)+qualityScore(a)-(used[voiceId(a)]||0)*reusePenalty;
          var sb=preferenceScore(b,p.speaker_key)+qualityScore(b)-(used[voiceId(b)]||0)*reusePenalty;
          if(sa!==sb)return sb-sa;
          return (clean(a.name)+'|'+voiceId(a)).localeCompare(clean(b.name)+'|'+voiceId(b));
        });
        var selected=ranked[0];
        map[p.speaker_key]={voiceURI:voiceId(selected),name:clean(selected.name)};
        used[voiceId(selected)]=(used[voiceId(selected)]||0)+1;
      });

      var aliases=aliasMapForPage();
      Object.keys(aliases).forEach(function(alias){
        var target=aliases[alias]; if(map[target]) map[alias]=map[target];
      });
      saveMap(map);

      var out=profiles.map(function(p){
        var copy=Object.assign({},p),m=map[p.speaker_key];
        /* Visitor voices are deliberately NOT forced by name. On some
           Chromium/Windows builds a listed visitor voice can be selected but
           produce no audio. Leaving visitor voice_hint blank lets each page
           choose a working installed en-US voice while keeping that visitor's
           fixed gender/rate/pitch. Management and recurring staff still keep
           their stable named voice assignment. */
        if(/^visitor_(female|male)_\d+$/i.test(p.speaker_key)) copy.voice_hint='';
        else if(m&&m.name) copy.voice_hint=m.name;
        copy.lang='en-US';
        return copy;
      });
      Object.keys(aliases).forEach(function(alias){
        var target=out.find(function(p){return p.speaker_key===aliases[alias];});
        if(target){
          var aliasProfile=Object.assign({},target,{speaker_key:alias,lang:'en-US'});
          if(alias==='visitor') aliasProfile.voice_hint='';
          out.push(aliasProfile);
        }
      });
      return out;
    });
    return voiceProfilesPromise;
  }
  window.SupportVoice={
    profiles:stableVoiceProfiles,
    reset:function(){try{localStorage.removeItem(VOICE_MAP_KEY);}catch(e){} voiceProfilesPromise=null;},
    getMap:function(){return getStoredMap();}
  };

  /* ---------------- Standalone local project data adapter ---------------- */
  function stableMember(members,key,order){
    if(!members.length)return '';
    var seed=clean(key)+'|'+String(order||0),total=0;
    for(var i=0;i<seed.length;i++) total+=seed.charCodeAt(i);
    return members[Math.abs(total)%members.length];
  }
  function visitorForPhase(phase){
    var p=clean(phase).toLowerCase();
    if(p.indexOf('assistant_head')>=0)return 'visitor_female_02';
    if(p.indexOf('quality_manager')>=0)return 'visitor_female_03';
    if(p.indexOf('manager')>=0)return 'visitor_female_01';
    if(p.indexOf('quality_team')>=0)return 'visitor_male_01';
    if(p.indexOf('team_leaders')>=0)return 'visitor_male_03';
    if(p.indexOf('opdc')>=0)return 'visitor_male_02';
    if(p.indexOf('supervisor')>=0)return 'visitor_male_02';
    if(p.indexOf('team_structure')>=0)return 'visitor_female_02';
    return 'visitor_female_01';
  }
  function castSpeaker(key,dialogueKey,phase,order){
    key=clean(key); var lower=key.toLowerCase();
    if(/^(visitor_|quality_member_|supervisor_|team_leader_|opdc_|employee_|trainee_)/.test(lower))return key;
    if(lower==='visitor')return visitorForPhase(phase);
    if(lower==='quality_team')return stableMember(['quality_member_male_01','quality_member_female_01','quality_member_female_02'],dialogueKey,order);
    if(lower==='supervisor')return stableMember(['supervisor_male_01','supervisor_female_01','supervisor_male_02','supervisor_female_02'],dialogueKey,order);
    if(lower==='team_leaders')return stableMember(['team_leader_social_media','team_leader_data','team_leader_reputation_behavior','team_leader_subscriptions','team_leader_user_account'],dialogueKey,order);
    if(lower==='opdc'){
      var explicit={OPDCV3_008:'opdc_chair',OPDCV3_010:'opdc_vice_chair',OPDCV3_012:'opdc_chair',OPDCV3_014:'opdc_member_male_01',OPDCV3_016:'opdc_vice_chair',OPDCV3_018:'opdc_member_male_01',OPDCV3_020:'opdc_member_male_02',OPDCV3_022:'opdc_chair',OPDCV3_024:'opdc_vice_chair',OPDCV3_026:'opdc_member_male_03',OPDCV3_028:'opdc_chair'};
      return explicit[clean(dialogueKey)]||stableMember(['opdc_chair','opdc_vice_chair','opdc_member_male_01','opdc_member_male_02','opdc_member_male_03'],dialogueKey,order);
    }
    if(lower==='employees')return stableMember(['employee_male_01','employee_female_01','employee_male_02','employee_female_02'],dialogueKey,order);
    if(lower==='trainee'||lower==='trainees')return stableMember(['trainee_male_01','trainee_female_01','trainee_male_02','trainee_female_02'],dialogueKey,order);
    return key;
  }
  function presentationDialogue(){
    return (DATA.PresentationDialogue||[]).filter(function(r){return r&&clean(r.dialogue_key)&&enabled(r.active);}).map(function(r){
      var order=num(r.order_no,0), en=clean(r.text_en), ar=clean(r.text_ar);
      en=en.replace(/The Committee Manager assigns/g,'The Committee Chair assigns')
           .replace(/Let me introduce the management team first/g,'Let me introduce the Customer Support Management Team first')
           .replace(/Certainly\. Let me introduce the Customer Support Management Team first, then I will show you how we coordinate issues and development requests\./g,'Certainly. Let me introduce the Customer Support Management Team first. We will start with our annual plan, KPIs and systems, then show you how we coordinate issues and development requests.')
           .replace(/Together, we review issues and improvement needs, agree ownership, and decide the right next action\./g,'Together, we form the Customer Support Management Team. We plan, measure performance, review priorities, and agree on the actions needed across the center.');
      ar=ar.replace(/يقوم مسؤول اللجنة بتوزيع/g,'يقوم رئيس اللجنة بتوزيع')
           .replace(/دعني أعرّفك أولًا على فريق الإدارة/g,'دعني أعرّفك أولًا على فريق إدارة دعم العملاء');
      var originalSpeaker=clean(r.speaker_key);
      var safeSpeaker=originalSpeaker.toLowerCase()==='visitor'
        ? 'visitor'
        : castSpeaker(originalSpeaker,r.dialogue_key,r.phase,order);
      return {dialogue_key:clean(r.dialogue_key),phase:clean(r.phase),speaker_key:safeSpeaker,text_en:en,text_ar:ar,order_no:order,active:true};
    }).sort(function(a,b){return a.order_no-b.order_no;});
  }
  function systemRows(sheetName,defaultColor){
    return (DATA[sheetName]||[]).map(function(r,i){
      if(!r||!enabled(r.active))return null;
      var name=clean(r.system_name||r.name||r.title||r.system_key); if(!name)return null;
      var primary=normalizeImageUrl(r.image_url||r.screenshot||r.image), extra=clean(r.image_urls||r.screenshots||r.screenshot_urls);
      var shots=splitImages(primary,extra), order=num(r.order_no||r.order||r.sort_order,i+1);
      return {number:i+1,system_key:clean(r.system_key||r.key),system_name:name,name:name,description:clean(r.description||r.short_description||r.summary),long_description:clean(r.long_description||r.more_details||r.details),link:clean(r.link||r.url||r.system_link)||'#',image_url:primary||(shots[0]||''),image_urls:extra,screenshots:shots,emoji:clean(r.emoji||r.icon),color:clean(r.color||r.theme)||defaultColor||'blue',team:clean(r.team||r.users_group),users:clean(r.users||r.used_by),order:order,order_no:order};
    }).filter(Boolean).sort(function(a,b){return a.order_no-b.order_no;});
  }
  function landscape(){
    return (DATA.ManagementSystemsLandscape||[]).map(function(r,i){
      if(!r||!clean(r.system_name)||!enabled(r.active))return null;
      var order=num(r.order_no,i+1),name=clean(r.system_name);
      return {system_name:name,name:name,image_url:normalizeImageUrl(r.image_url),emoji:clean(r.emoji),color:(clean(r.color)||'blue').toLowerCase(),order_no:order,order:order,active:true};
    }).filter(Boolean).sort(function(a,b){return a.order_no-b.order_no;});
  }
  function managementTools(){
    return (DATA.ManagementTools||[]).filter(function(r){return r&&clean(r.tool_key)&&enabled(r.active);}).map(function(r){
      var k=clean(r.tool_key),role=clean(r.tool_role); if(k==='clickup'||k==='internal_tracking')role=k; else if(k.indexOf('issue_evidence_')===0)role='issue_evidence';
      return {tool_key:k,tool_role:role,name:clean(r.name),description:clean(r.description),link:clean(r.link),image_url:normalizeImageUrl(r.image_url),order_no:num(r.order_no,0),active:true};
    }).sort(function(a,b){return a.order_no-b.order_no;});
  }
  function dispatch(method,args){
    switch(method){
      case 'getContent': return {};
      case 'getPresentationDialogue': return presentationDialogue();
      case 'getSystems': return systemRows('Systems','blue');
      case 'getManagementSystems': return systemRows('ManagementSystems','gold');
      case 'getManagementSystemsLandscape': return landscape();
      case 'getManagementTools': return managementTools();
      case 'getQualitySystems': return systemRows('QualitySystems','teal');
      case 'getQualityTeamSystems': return systemRows('QualityTeamSystems','teal');
      case 'getSupervisorSystems': return systemRows('SupervisorSystems','gold');
      case 'getTeamLeaderSystems': return systemRows('TeamLeaderSystems','gold');
      case 'getEmployeeSystems': return systemRows('EmployeeSystems','blue');
      case 'getTraineeSystems': return systemRows('TraineeSystems','blue');
      case 'getOPDCSystem': var rows=systemRows('OPDCSystem','gold'); return rows.length?rows[0]:null;
      default: throw new Error('Standalone backend method not implemented: '+method);
    }
  }

  function makeRunner(){
    var success=null,failure=null;
    var proxy=new Proxy({}, {get:function(_t,prop){
      if(prop==='withSuccessHandler')return function(fn){success=fn;return proxy;};
      if(prop==='withFailureHandler')return function(fn){failure=fn;return proxy;};
      return function(){
        var args=[].slice.call(arguments);
        if(prop==='getPage'){ navigate(args[0]); return proxy; }
        if(prop==='getVoiceProfiles'){
          stableVoiceProfiles().then(function(v){ if(success)success(v); }).catch(function(e){ if(failure)failure(e); else console.error(e); });
          return proxy;
        }
        try{
          var result=dispatch(String(prop),args);
          setTimeout(function(){ if(success)success(result); },0);
        }catch(e){ setTimeout(function(){ if(failure)failure(e); else console.error(e); },0); }
        return proxy;
      };
    }});
    return proxy;
  }
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  try{ Object.defineProperty(window.google.script,'run',{configurable:true,get:makeRunner}); }
  catch(e){ window.google.script.run=makeRunner(); }

  /* DEV navigator: full page navigation, never document.write(). This makes
     the old page truly unload, so timers and speech cannot overlap. */
  function addDevNavigator(){
    if(document.getElementById('tourDevNav'))return;
    var nav=document.createElement('nav'); nav.id='tourDevNav'; nav.setAttribute('aria-label','Developer page navigator');
    var items=PAGE_LIST.map(function(p){return '<button type="button" class="tourDevMenu__item'+(p[0]===ACTIVE_PAGE?' is-active':'')+'" data-page="'+p[0]+'"><span>'+p[1]+'</span></button>';}).join('');
    nav.innerHTML='<button id="tourDevFab" class="tourDevFab" type="button" aria-expanded="false">DEV</button><div id="tourDevMenu" class="tourDevMenu"><div class="tourDevMenu__head"><span>JUMP TO PAGE</span><span>'+ACTIVE_PAGE.toUpperCase()+'</span></div>'+items+'</div>';
    document.body.appendChild(nav);
    var fab=nav.querySelector('#tourDevFab'),menu=nav.querySelector('#tourDevMenu');
    function setOpen(open){menu.classList.toggle('is-open',open);fab.classList.toggle('is-open',open);fab.setAttribute('aria-expanded',open?'true':'false');}
    fab.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setOpen(!menu.classList.contains('is-open'));});
    menu.addEventListener('click',function(e){var btn=e.target.closest('button[data-page]');if(!btn)return;e.preventDefault();e.stopPropagation();nav.classList.add('is-loading');setOpen(false);navigate(btn.getAttribute('data-page'),{dev:true});});
    document.addEventListener('click',function(){setOpen(false);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addDevNavigator,{once:true}); else addDevNavigator();
})();
