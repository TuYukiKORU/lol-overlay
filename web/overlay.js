const stage = document.querySelector('#stage');
const query = new URLSearchParams(location.search);
const previewMode = query.has('preview');
const artEnabled = previewMode && query.has('art');
const artSurfaces = {draft:'.champion-draft',game:'.score-strip',result:'.result',cover:'.cover'};
let artImages = {}, artRequest = 0;
const names = {dragon:'DRAGON',baron:'BARON',herald:'HERALD',grubs:'VOID GRUBS'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val = value => value == null ? '—' : Number(value).toLocaleString('ja-JP');
let current, effectKey;
Champions.ready.then(()=>{if(current)render(current);}).catch(()=>{});
function championImage(value){const c=Champions.find(value);return c?`<img class="champion-portrait" src="${c.image}" alt="${esc(c.name)}">`:'<span class="champion-portrait unknown-portrait">?</span>';}
function renderChampionDraft(s){
 const step=Champions.active(s),flow=s.draftFlow;
 const label=flow?.enabled?(step?`${step.side==='blue'?'BLUE':'RED'} TEAM ${step.kind.toUpperCase()}`:'DRAFT COMPLETE'):'BAN / PICK';
 const active=(side,kind,slot)=>step&&step.side===side&&step.kind===kind&&step.slot===slot?' draft-active':'';
 return `<div class="full-scene champion-draft"><div class="scene-title ${step?.side||''}"><small>${flow?.enabled?`STEP ${Math.min(flow.step+1,20)} / 20`:'CHAMPION SELECT'}</small><h1>${label}</h1><p>${step?esc(s.teams[s.sides[step.side]].name)+' · 選択中':flow?.enabled?'全選択完了':'MANUAL DRAFT'}</p></div><div class="draft-grid">${['blue','red'].map(side=>{const t=s.teams[s.sides[side]];return `<section class="draft-team ${side}"><h2>${logo(t)}${esc(t.name)}</h2><div class="picks">${t.players.map((p,i)=>`<div class="pick${active(side,'pick',i)}" style="animation-delay:${i*70}ms">${championImage(p.champion)}<small>PICK ${i+1}</small><strong>${esc(Champions.find(p.champion)?.name||p.champion||'未選択')}</strong><span>${esc(p.name)}</span></div>`).join('')}</div><div class="bans"><small>BANS</small>${t.bans.map((b,i)=>`<span class="ban-card${active(side,'ban',i)}">${championImage(b)}<b>${esc(Champions.find(b)?.name||b||'—')}</b></span>`).join('')}</div></section>`;}).join('')}</div></div>`;
}
function fit() { stage.style.transform = `scale(${Math.min(innerWidth/1920,innerHeight/1080)})`; }
addEventListener('resize',fit); fit();
function logo(t) {return t.logo ? `<img class="logo" src="${esc(t.logo)}" alt="">` : `<span class="logo placeholder">${esc(t.name.slice(0,2))}</span>`;}
function gold(s) {let a=s.teams[s.sides.blue], b=s.teams[s.sides.red]; return a.gold==null || b.gold==null ? 'GOLD DIFF —' : a.gold===b.gold ? 'GOLD EVEN' : `${esc(a.gold>b.gold?a.name:b.name)} +${val(Math.abs(a.gold-b.gold))} G`;}
function render(s) {
 current=s; applyLayout(s.layout); const blue=s.teams[s.sides.blue],red=s.teams[s.sides.red];
 const objectLine=id=>Object.keys(names).map(k=>`${names[k]} ${s.events.filter(e=>e.team===id&&e.kind===k).length}`).join('　');
 if(s.scene==='game') stage.innerHTML=`<div class="score-strip"><div class="team-score blue">${logo(blue)}<strong>${esc(blue.name)}</strong><b>${val(blue.kills)}</b></div><div class="score-middle"><small>LIVE MATCH</small><strong>${gold(s)}</strong></div><div class="team-score red"><b>${val(red.kills)}</b><strong>${esc(red.name)}</strong>${logo(red)}</div><div class="object-line blue">${objectLine(s.sides.blue)}</div><div class="object-line red">${objectLine(s.sides.red)}</div></div>`;
 else if(s.scene==='draft') stage.innerHTML=renderChampionDraft(s);
 else stage.innerHTML=`<div class="full-scene result"><div class="scene-title"><small>MATCH RESULT</small><h1>${s.winner?esc(s.teams[s.winner].name)+' · VICTORY':'勝利チーム未確定'}</h1><p>${gold(s)} / ${esc(s.damageLabel)}</p></div><div class="result-grid">${['blue','red'].map(side=>{const t=s.teams[s.sides[side]];return `<section class="${side}"><h2>${logo(t)}${esc(t.name)}</h2><table><thead><tr><th>PLAYER / CHAMPION</th><th>K / D / A</th><th>DAMAGE</th></tr></thead><tbody>${t.players.map(p=>`<tr><td>${esc(p.name)}<small>${esc(Champions.find(p.champion)?.name||p.champion||'未設定')}</small></td><td>${val(p.kills)} / ${val(p.deaths)} / ${val(p.assists)}</td><td>${val(p.damage)}</td></tr>`).join('')}</tbody></table></section>`;}).join('')}</div>${damageChart(s)}</div>`;
 stage.insertAdjacentHTML('beforeend','<div id="effect-slot"></div>'); effectKey=null; tick();
 if(s.cover.visible) stage.insertAdjacentHTML('beforeend',`<div class="cover"><div class="cover-mark">Ⅱ</div><small>BROADCAST INTERMISSION</small><h1>${esc(s.cover.title)}</h1><p>${esc(s.cover.subtitle)}</p><div>${logo(blue)}<span>VS</span>${logo(red)}</div></div>`);
 if(s.demo)stage.insertAdjacentHTML('beforeend','<div class="demo-stamp">EXHIBITION / 架空の試験データ</div>');
 if(artEnabled)applySceneArt();
}
function applySceneArt(){
 const scene=current?.cover.visible?'cover':current?.scene;
 const surface=stage.querySelector(artSurfaces[scene]||'.has-art');
 if(!surface)return;
 surface.querySelector('.scene-art')?.remove();
 const image=artImages[scene];
 surface.classList.toggle('has-art',Boolean(image));
 if(image)surface.prepend(image);
}
async function refreshArt(){
 const request=++artRequest;
 const entries=await Promise.all(Object.keys(artSurfaces).map(async scene=>{
  const image=new Image();
  image.alt='';
  image.className='scene-art';
  image.src=`/demo/art/${scene}.png?v=${Date.now()}`;
  try{await image.decode();}catch{return [scene,'missing'];}
  if(image.naturalWidth!==1920||image.naturalHeight!==1080)return [scene,'size'];
  return [scene,'loaded',image];
 }));
 if(request!==artRequest)return;
 artImages=Object.fromEntries(entries.map(([scene,,image])=>[scene,image]));
 applySceneArt();
 parent.postMessage({type:'art-status',statuses:Object.fromEntries(entries.map(([scene,status])=>[scene,status]))},location.origin);
}
function tick(){if(!current)return;const e=current.effect;const key=e&&e.until>Date.now()?e.id:null;if(key===effectKey)return;effectKey=key;document.querySelector('#effect-slot').innerHTML=key?`<div class="acquisition ${current.sides.blue===e.team?'blue':'red'}"><small>OBJECTIVE SECURED</small><strong>${names[e.kind]}</strong><span>${esc(current.teams[e.team].name)}</span></div>`:'';}
setInterval(tick,100);
if(previewMode) addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent)return;
 if(event.data?.type==='preview')render(event.data.state);
 if(artEnabled&&event.data?.type==='reload-art')refreshArt();
});
else {let revision=-1;async function poll(){try{const r=await fetch(new URLSearchParams(location.search).get('demo')==='1'?'/demo/state':'/state');if(!r.ok)throw Error();const data=await r.json();if(data.revision!==revision){render(data.state);revision=data.revision;}}catch{/* Keep the last known display when the local host is unavailable. */}setTimeout(poll,300);}poll();}

function applyLayout(layout) {
 const l={preset:'worlds',scoreX:390,scoreY:0,scoreWidth:1140,effectX:710,effectY:124,draftRailWidth:386,draftTopHeight:200,draftBottomHeight:228,...layout};
 stage.className=l.preset==='worlds'?'layout-worlds':'layout-classic';
 for(const key of ['scoreX','scoreY','scoreWidth','effectX','effectY','draftRailWidth','draftTopHeight','draftBottomHeight'])
  stage.style.setProperty('--'+key,Number(l[key])+'px');
}
function damageChart(s) {
 const teams=['blue','red'].map(side=>s.teams[s.sides[side]]);
 const max=Math.max(1,...teams.flatMap(t=>t.players.map(p=>p.damage||0)));
 return `<div class="damage-comparison"><h3>${esc(s.damageLabel)}</h3>${Array.from({length:5},(_,i)=>`<div class="damage-pair"><span>${esc(teams[0].players[i].name)}</span><div class="damage-track left"><i style="width:${(teams[0].players[i].damage||0)/max*100}%"></i><b>${val(teams[0].players[i].damage)}</b></div><small>${i+1}</small><div class="damage-track right"><i style="width:${(teams[1].players[i].damage||0)/max*100}%"></i><b>${val(teams[1].players[i].damage)}</b></div><span>${esc(teams[1].players[i].name)}</span></div>`).join('')}</div>`;
}
