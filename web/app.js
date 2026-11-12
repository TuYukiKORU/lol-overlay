const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const stateEndpoint=demoMode?'/demo/state':'/state';
const publishEndpoint=demoMode?'/demo/publish':'/publish';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const objects={dragon:'ドラゴン',baron:'バロン',herald:'ヘラルド',grubs:'ヴォイドグラブ'};
const sceneLabels={draft:'BAN / PICK',game:'試合中',result:'試合結果',cover:'中断'};
const sceneTabs={draft:'draft',game:'match',result:'result',cover:'cover'};
let output, outputGeneration=0;
let draft,live,revision=0,tab=new URLSearchParams(location.search).get('tab')==='vision'?'vision':'teams',dirty=false,busy=false,objectiveTeam='a',objectiveKind='dragon';
function message(text,error=false){if(demoMode)text=text.replaceAll('本番','試験表示');$('#message').textContent=text;$('#message').className=error?'error':'';}
function confirmAction(text){
 return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='confirm-dialog';
  const prompt=document.createElement('p');prompt.textContent=text;
  const actions=document.createElement('div');actions.className='button-row';
  const cancel=document.createElement('button');cancel.textContent='キャンセル';
  const accept=document.createElement('button');accept.textContent='実行する';accept.className='primary';
  const finish=value=>{modal.close();modal.remove();resolve(value);};
  cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));
  modal.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
  actions.append(cancel,accept);modal.append(prompt,actions);document.body.append(modal);modal.showModal();cancel.focus();
 });
}
function preview(){if(draft)$('#preview').contentWindow.postMessage({type:'preview',state:draft},location.origin);}
function visibleScene(state){return state.cover.visible?'cover':state.scene;}
function showBroadcastStatus(){
 const scene=output?.state&&sceneLabels[visibleScene(output.state)];
 const status=$('#live-scene');
 const label=scene||'接続を確認できません';
 if(status.textContent!==label)status.textContent=label;
 const badge=$('#dirty');
 const outdated=draft&&output&&output.revision!==revision;
 badge.textContent=dirty?'未反映の変更あり':outdated?'再読込が必要':draft?'変更なし':output?'読み込み中…':'未接続';
 badge.classList.toggle('pending',Boolean(dirty||outdated));
}
function showScenePicker(){
 for(const button of document.querySelectorAll('#scene-picker button')){
  button.disabled=!draft;
  button.setAttribute('aria-pressed',String(draft&&visibleScene(draft)===button.dataset.scene||false));
 }
}
function setTab(next){
 tab=next;
 for(const button of document.querySelectorAll('.control-editor [data-tab]')){
  const active=button.dataset.tab===tab;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','true');
  else button.removeAttribute('aria-current');
 }
 if(tab==='vision'||tab==='storage')$('#settings-menu').open=true;
 render();
}
function changed(){dirty=true;showBroadcastStatus();showScenePicker();preview();}
function field(label,path,value,type='text'){return `<label>${esc(label)}<input data-path="${path}" type="${type}" ${type==='number'?'min="0" max="100000000" step="1"':'maxlength="100"'} value="${esc(value)}" placeholder="${type==='number'?'未入力':'未設定'}"></label>`;}
function select(label,path,value,options){return `<label>${label}<select data-path="${path}">${Object.entries(options).map(([k,v])=>`<option value="${k}" ${String(value??'')===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
function teamOptions(){return {a:draft.teams.a.name,b:draft.teams.b.name};}
function render(){if(!draft)return;
 $('#vision').hidden=tab!=='vision'; if(tab==='vision')window.dispatchEvent(new Event('vision-open'));
 const teamPanels=fn=>`<div class="two-col">${['blue','red'].map(side=>{let id=draft.sides[side],t=draft.teams[id];return `<article class="panel ${side}"><div class="panel-heading"><h2>${esc(t.name)}</h2><span class="badge">${side.toUpperCase()} / TEAM ${id.toUpperCase()}</span></div>${fn(t,id)}</article>`;}).join('')}</div>`;
 let html='';
 if(tab==='teams') html=`<div class="toolbar"><p>チームIDに選手・記録を保持します。サイド交換で記録は移動しません。</p><button data-action="swap">Blue / Red を交換</button></div>`+teamPanels((t,id)=>`${field('チーム名',`teams.${id}.name`,t.name)}<div class="logo-upload">${t.logo?`<img src="${esc(t.logo)}" alt="チームロゴ">`:'<span class="logo-placeholder">LOGO</span>'}<label>ローカル画像<input type="file" data-logo="${id}" accept="image/png,image/jpeg,image/webp"></label><button data-action="remove-logo" data-team="${id}">解除</button></div><p class="hint">PNG / JPEG / WebP・2MB以下。画像を保存データ内に保持します。</p><div class="players">${t.players.map((p,i)=>field(`選手 ${i+1}`,`teams.${id}.players.${i}.name`,p.name)).join('')}</div>`);
 if(tab==='match') html=teamPanels((t,id)=>`${field('キル数',`teams.${id}.kills`,t.kills,'number')}${field('チーム合計ゴールド',`teams.${id}.gold`,t.gold,'number')}`)+`<article class="panel"><h2>オブジェクト獲得</h2><div class="two-col"><label>獲得チーム<select id="objective-team">${Object.entries(teamOptions()).map(([id,n])=>`<option value="${id}" ${id===objectiveTeam?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>種類<select id="objective-kind">${Object.entries(objects).map(([id,n])=>`<option value="${id}" ${id===objectiveKind?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="button-row"><button data-action="effect">演出をプレビュー</button><button data-action="record">取得を記録（下書き）</button><button data-action="stop">演出を終了</button></div><p class="hint">演出は6秒間。再生だけでは取得数を加算しません。本番反映時に演出が始まります。</p><ul class="events">${draft.events.map(e=>`<li><span>${esc(draft.teams[e.team].name)} · ${objects[e.kind]}</span><button data-action="delete-event" data-id="${esc(e.id)}">取消</button></li>`).join('')||'<li>取得記録なし</li>'}</ul></article>`;
 if(tab==='cover') html=`<article class="panel"><h2>中断画面</h2>${field('見出し','cover.title',draft.cover.title)}${field('補足','cover.subtitle',draft.cover.subtitle)}<p class="hint">プレビューで「中断」を選ぶと、画面全体を覆うふた絵を確認できます。</p></article>`;
 if(tab==='draft')html=renderDraftControls();
 if(tab==='result')html=`<article class="panel"><h2>試合結果</h2><div class="two-col">${select('勝利チーム','winner',draft.winner,{'':'未確定',...teamOptions()})}${field('ダメージの集計対象','damageLabel',draft.damageLabel)}</div><p class="hint">最終ゴールドは「試合・演出」の値を使用します。未確認の値は空欄にしてください。</p></article>`+teamPanels((t,id)=>t.players.map((p,i)=>`<div class="stats-row"><h3>${esc(p.name)} <small>${esc(Champions.find(p.champion)?.name||p.champion)}</small></h3><div class="stat-inputs">${[['K','kills'],['D','deaths'],['A','assists'],['総ダメージ','damage']].map(([label,key])=>field(label,`teams.${id}.players.${i}.${key}`,p[key],'number')).join('')}</div></div>`).join(''));
 if(tab==='storage')html=`<div class="two-col"><article class="panel"><h2>保存・復元</h2><p>本番反映時に、このPCの <code>data/live.json</code> へ自動保存します。操作画面の下書きはJSONで別途保存できます。</p><div class="button-row"><button data-action="export">下書きをJSON保存</button><button data-action="reload">本番から読み直す</button></div><label>JSONをプレビューへ読み込む<input id="import" type="file" accept=".json,application/json"></label><p class="hint">読込だけでは本番表示は変わりません。確認後に本番へ反映してください。</p></article><article class="panel"><h2>次の試合</h2><p>名前・ロゴ・サイドを残し、キル・ゴールド・取得記録・BAN / PICK・個人スタッツ・勝敗を空にします。ふた絵は表示している場合そのまま維持します。</p><button data-action="reset" class="danger">下書きの試合データをリセット</button><h3>OBSブラウザソース</h3><code>${esc(location.origin)}/overlay</code><p>幅1920 / 高さ1080。操作画面ではなく、このURLを指定してください。</p></article></div>`;
 $('#editor').innerHTML=demoMode?html.replaceAll('本番','試験表示').replaceAll('data/live.json','data/demo.json').replaceAll(`${location.origin}/overlay`,`${location.origin}/overlay?demo=1`):html;
}
function assign(path,value){const keys=path.split('.');let obj=draft;for(const k of keys.slice(0,-1))obj=obj[k];obj[keys.at(-1)]=value;}
$('#editor').addEventListener('input',e=>{const path=e.target.dataset.path;if(!path)return;let v=e.target.type==='checkbox'?e.target.checked:e.target.value;if(e.target.type==='number'){if(!e.target.checkValidity())return;v=v===''?null:Number(v);}if(path==='winner'&&v==='')v=null;assign(path,v);changed();});
$('#editor').addEventListener('change',async e=>{
 if(e.target.id==='objective-team')objectiveTeam=e.target.value;
 if(e.target.id==='objective-kind')objectiveKind=e.target.value;
 const id=e.target.dataset.logo;
 if(id){const f=e.target.files[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>2000000){message('PNG / JPEG / WebP、2MB以下の画像を選んでください。',true);return;}try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});const img=new Image();img.src=data;await img.decode();draft.teams[id].logo=data;changed();render();}catch{message('画像を読み込めませんでした。',true);}}
 if(e.target.id==='import'){const f=e.target.files[0];if(!f)return;try{if(f.size>7000000)throw Error();const s=JSON.parse(await f.text());validateImport(s);if(!await confirmAction('現在の下書きを読み込んだデータで置き換えますか？'))return;draft=s;draft.effect=null;changed();render();message('プレビューへ読み込みました。本番は変更していません。');}catch{message('対応する保存JSONではありません。',true);}}
});
function validateImport(s){
 if(s?.draftFlow&&(!Number.isInteger(s.draftFlow.step)||s.draftFlow.step<0||s.draftFlow.step>20||typeof s.draftFlow.enabled!=='boolean'))throw Error();
 if(!s||s.schema!==1||!['game','draft','result'].includes(s.scene)||typeof s.matchId!=='string'||typeof s.damageLabel!=='string'||!s.sides||Object.keys(s.sides).sort().join()!=='blue,red'||Object.values(s.sides).sort().join()!=='a,b'||![null,'a','b'].includes(s.winner)||!s.cover||typeof s.cover.visible!=='boolean'||typeof s.cover.title!=='string'||typeof s.cover.subtitle!=='string'||!Array.isArray(s.events)||s.events.length>1000)throw Error();
 const str=v=>typeof v==='string'&&v.length<=100;const num=v=>v===null||(Number.isInteger(v)&&v>=0&&v<=100000000);
 for(const id of ['a','b']){const t=s.teams?.[id];if(!t||!str(t.name)||typeof t.logo!=='string'||t.logo.length>3000000||(t.logo&&!/^data:image\/(png|jpeg|webp);base64,/.test(t.logo))||!num(t.kills)||!num(t.gold)||!Array.isArray(t.players)||t.players.length!==5||!Array.isArray(t.bans)||t.bans.length!==5||!t.bans.every(str))throw Error();for(const p of t.players)if(!str(p.name)||!str(p.champion)||!['kills','deaths','assists','damage'].every(k=>num(p[k])))throw Error();}
 const ids=new Set();for(const e of s.events){if(!e||!str(e.id)||ids.has(e.id)||!['a','b'].includes(e.team)||!Object.hasOwn(objects,e.kind))throw Error();ids.add(e.id);}
}
$('#editor').addEventListener('click',async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const action=b.dataset.action;
 if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`lol-overlay-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(action==='reload'){if(await confirmAction('未反映の編集を破棄して、本番から読み直しますか？'))load();return;}
 if(action==='swap')[draft.sides.blue,draft.sides.red]=[draft.sides.red,draft.sides.blue];
 if(action==='remove-logo')draft.teams[b.dataset.team].logo='';
 if(action==='effect')draft.effect={id:crypto.randomUUID(),team:objectiveTeam,kind:objectiveKind,until:Date.now()+6000};
 if(action==='stop')draft.effect=null;
 if(action==='record')draft.events.push({id:crypto.randomUUID(),team:objectiveTeam,kind:objectiveKind});
 if(action==='delete-event')draft.events=draft.events.filter(item=>item.id!==b.dataset.id);
 if(action==='reset'){if(!await confirmAction('下書きの試合情報をリセットしますか？本番は反映するまで変わりません。'))return;draft.draftFlow={enabled:false,step:0};draft.matchId=crypto.randomUUID();draft.events=[];draft.winner=null;draft.effect=null;draft.scene='game';for(const t of Object.values(draft.teams)){t.kills=null;t.gold=null;t.bans=['','','','',''];for(const p of t.players){p.champion='';p.kills=p.deaths=p.assists=p.damage=null;}}}
 changed();render();
});
$('.control-editor').addEventListener('click',event=>{
 const button=event.target.closest('button[data-tab]');
 if(button)setTab(button.dataset.tab);
});
$('#scene-picker').addEventListener('click',event=>{
 const scene=event.target.closest('button[data-scene]')?.dataset.scene;
 if(!scene||!draft)return;
 if(visibleScene(draft)!==scene){
  draft.cover.visible=scene==='cover';
  if(scene!=='cover')draft.scene=scene;
  changed();
 }
 if(tab!==sceneTabs[scene]){
  setTab(sceneTabs[scene]);
  if($('#tabs').getBoundingClientRect().top<$('.publish-bar').getBoundingClientRect().bottom){
   $('#tabs').scrollIntoView({block:'start'});
  }
 }
});
$('#preview').addEventListener('load',preview);
async function readOutput(){
 const response=await fetch(stateEndpoint,{signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error();
 return response.json();
}
function acceptOutput(data){
 outputGeneration++;
 output=data;
 revision=data.revision;
 live=data.state;
}
function resetDraft(data){
 acceptOutput(data);
 draft=structuredClone(live);
 draft.effect=null;
 dirty=false;
 render();
 showScenePicker();
 preview();
 message('');
}
async function watchOutput(){
 const generation=outputGeneration;
 let latest;
 try{latest=await readOutput();}catch{/* Update the connection indicator below. */}
 if(generation===outputGeneration){
  if(latest&&!draft&&!busy){
   resetDraft(latest);
   $('#publish').disabled=false;
  }else output=latest;
  showBroadcastStatus();
 }
 setTimeout(watchOutput,1000);
}
async function load(){
 if(busy)return;
 busy=true;
 $('#publish').disabled=true;
 try{
  resetDraft(await readOutput());
 }catch{message('ローカルサーバーに接続できません。起動状態を確認してください。',true);}
 finally{
  showBroadcastStatus();
  busy=false;
  $('#publish').disabled=!draft;
 }
}
$('#publish').addEventListener('click',async()=>{
 if(busy||!draft)return;
 if(![...document.querySelectorAll('#editor input')].every(i=>i.reportValidity()))return;
 busy=true;
 $('#publish').disabled=true;
 const snapshot=JSON.stringify(draft);
 const sent=structuredClone(draft);
 if(sent.effect&&sent.effect.id!==live.effect?.id)sent.effect.until=Date.now()+6000;
 try{
  const response=await fetch(publishEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,state:sent})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error);
  acceptOutput(data);
  if(JSON.stringify(draft)===snapshot){
   draft=structuredClone(live);
   dirty=false;
   showScenePicker();
   preview();
  }
  message('本番へ反映し、このPCに保存しました。');
 }catch(error){message(error.message||'反映できませんでした。',true);}
 finally{
  showBroadcastStatus();
  busy=false;
  $('#publish').disabled=false;
 }
});
if(demoMode){document.body.classList.add('test-mode');document.title='LoL Overlay · 試験操作';$('#publish').textContent='試験表示へ反映';$('#mode-banner').hidden=false;$('#reset-demo').hidden=false;$('#output-link').href='/overlay?demo=1';$('#output-link').textContent='試験表示 ↗';}
$('#reset-demo').addEventListener('click',async()=>{if(!await confirmAction('試験用の下書きを初期サンプルに戻しますか？'))return;try{const r=await fetch('/demo/sample');if(!r.ok)throw Error();draft=await r.json();changed();render();message('試験サンプルを読み込みました。試験表示へ反映すると保存されます。');}catch{message('サンプルを読み込めません。',true);}});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
setTab(tab);
load().then(watchOutput);
