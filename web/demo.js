const frame = document.querySelector('#demo-output');
const status = document.querySelector('#demo-status');
const autoButton = document.querySelector('#demo-auto');
const scenes = ['draft','game','result','cover'];
const labels = {draft:'BAN / PICK',game:'試合中 · 獲得演出',result:'試合結果',cover:'中断・ふた絵'};
let sample, scene='draft', cycleTimer=null, revision=-1, effect=null, startedAt=0;
let autoplayRequested=new URLSearchParams(location.search).get('autoplay')==='1';
function paint(){
 if(!sample)return;
 const state=structuredClone(sample);
 state.scene=scene==='cover'?'game':scene;state.cover.visible=scene==='cover';state.effect=effect;state.demo=true;
 frame.contentWindow.postMessage({type:'preview',state},location.origin);
 document.querySelectorAll('[data-scene]').forEach(b=>{const active=b.dataset.scene===scene;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelector('#scene-label').textContent=labels[scene];
 document.querySelector('#scene-number').textContent='0'+(scenes.indexOf(scene)+1)+' / 04';
}
const artButton = document.querySelector('#reload-art');
const artStatus = document.querySelector('#art-status');
function reloadArt(){
 artButton.disabled=true;
 artStatus.textContent='素材を確認しています…';
 frame.contentWindow.postMessage({type:'reload-art'},location.origin);
}
frame.addEventListener('load',()=>{
 paint();
 reloadArt();
});
artButton.addEventListener('click',reloadArt);
addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='art-status')return;
 const descriptions={loaded:'適用済み',size:'標準表示（1920×1080のPNGが必要）',missing:'標準表示（素材なし・読込不可）'};
 const items=scenes.map(name=>{
  const item=document.createElement('li');
  item.textContent=`${name}.png · ${descriptions[event.data.statuses[name]]}`;
  return item;
 });
 document.querySelector('#art-files').replaceChildren(...items);
 artStatus.textContent='読み込んだ素材は、このデモの対応シーンに表示します。';
 artButton.disabled=false;
});
if(frame.contentDocument?.readyState==='complete'&&frame.contentWindow.location.pathname==='/overlay')reloadArt();
function progress(){
 const elapsed=cycleTimer?Math.min(12000,performance.now()-startedAt):0;
 document.querySelector('#scene-progress').style.width=elapsed/120+'%';
 document.querySelector('#playback-status').textContent=cycleTimer?'自動上映 · 次へ '+Math.ceil((12000-elapsed)/1000)+'秒':'手動操作';
}
function stop(){clearInterval(cycleTimer);cycleTimer=null;autoButton.textContent='▶ 自動上映';autoButton.setAttribute('aria-pressed','false');progress();}
function selectScene(next,withEffect=false){
 scene=next;effect=withEffect&&scene==='game'?{id:crypto.randomUUID(),team:sample.sides.blue,kind:'baron',until:Date.now()+6000}:null;
 startedAt=performance.now();paint();progress();
}
function toggleAuto(){
 if(!sample)return;if(cycleTimer){stop();return;}
 selectScene('draft');autoButton.textContent='Ⅱ 上映を停止';autoButton.setAttribute('aria-pressed','true');
 cycleTimer=setInterval(()=>{if(performance.now()-startedAt>=12000)selectScene(scenes[(scenes.indexOf(scene)+1)%scenes.length],true);progress();},100);progress();
}
document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>{if(!sample)return;stop();selectScene(b.dataset.scene);}));
document.querySelector('#demo-effect').addEventListener('click',()=>{if(!sample)return;stop();selectScene('game');effect={id:crypto.randomUUID(),team:sample.sides.blue,kind:'dragon',until:Date.now()+6000};paint();});
autoButton.addEventListener('click',toggleAuto);
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('#showcase').requestFullscreen();}catch{status.textContent='全画面表示を開始できません。ブラウザの全画面操作を使用してください。';}}
document.querySelector('#demo-fullscreen').addEventListener('click',fullscreen);
document.addEventListener('keydown',event=>{
 if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName)||event.target.isContentEditable)return;
 if(event.code==='Space'){event.preventDefault();toggleAuto();}
 if(event.key.toLowerCase()==='f')fullscreen();
 if(sample&&/^[1-4]$/.test(event.key)){stop();selectScene(scenes[Number(event.key)-1]);}
});
async function sync(){
 try{
  const r=await fetch('/demo/state',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();
  const data=await r.json();
  if(data.revision!==revision){sample=data.state;revision=data.revision;document.querySelector('h1').textContent=sample.teams[sample.sides.blue].name+' vs '+sample.teams[sample.sides.red].name;document.querySelectorAll('[data-needs-data]').forEach(b=>{b.disabled=false;});paint();}
  if(autoplayRequested){autoplayRequested=false;toggleAuto();}
  status.textContent='接続済み · 架空のサンプルデータ / 本番データには影響しません';status.classList.remove('disconnected');
 }catch{status.textContent=sample?'接続が途切れました。最後に取得したデータで表示中 · 自動再接続しています…':'サーバーに接続できません · 自動再接続しています…';status.classList.add('disconnected');}
 setTimeout(sync,1500);
}
sync();
