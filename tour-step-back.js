(function(){
  'use strict';

  var BUTTON_ID='numeroStepBackControl';

  function createButton(){
    if(document.getElementById(BUTTON_ID)) return;
    if(typeof window.numeroStepBack!=='function') return;

    var b=document.createElement('button');
    b.type='button';
    b.id=BUTTON_ID;
    b.setAttribute('aria-label','Back one step');
    b.title='Back one step';
    b.textContent='↶';
    b.style.cssText=[
      'position:fixed','right:80px','bottom:22px','z-index:2147482000',
      'width:46px','min-width:46px','height:38px','padding:0','margin:0',
      'display:inline-flex','align-items:center','justify-content:center',
      'border-radius:999px','border:1px solid rgba(255,255,255,.20)',
      'background:rgba(15,12,10,.78)','color:#fff','font:700 21px/1 Arial,sans-serif',
      'box-shadow:0 12px 30px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.08)',
      'backdrop-filter:blur(14px)','-webkit-backdrop-filter:blur(14px)',
      'cursor:pointer','user-select:none','-webkit-user-select:none','touch-action:manipulation',
      'transition:none','transform:none'
    ].join(';');

    function canBack(){
      try{
        return typeof window.numeroCanStepBack==='function' ? !!window.numeroCanStepBack() : true;
      }catch(e){ return true; }
    }

    function sync(){
      var enabled=canBack();
      b.disabled=!enabled;
      b.style.opacity=enabled?'1':'.34';
      b.style.cursor=enabled?'pointer':'default';
    }

    b.addEventListener('pointerdown',function(e){
      try{e.stopPropagation();}catch(_){}
    },true);

    b.addEventListener('click',function(e){
      try{e.preventDefault();e.stopPropagation();}catch(_){}
      if(!canBack()) return;
      try{
        var result=window.numeroStepBack();
        if(result && typeof result.then==='function') result.catch(function(err){console.warn('Back step failed',err);});
      }catch(err){
        console.warn('Back step failed',err);
      }
      window.setTimeout(sync,80);
      window.setTimeout(sync,500);
    },true);

    document.body.appendChild(b);
    sync();
    window.setInterval(sync,600);

    var style=document.createElement('style');
    style.textContent='@media(max-width:700px){#'+BUTTON_ID+'{right:68px!important;bottom:14px!important}} #'+BUTTON_ID+':active{transform:none!important}';
    document.head.appendChild(style);
  }

  function install(){
    createButton();
    if(!document.getElementById(BUTTON_ID)) window.setTimeout(createButton,400);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
