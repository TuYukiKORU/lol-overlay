/* Local source capture -> offline OCR candidates -> explicit draft acceptance. */
const vision = document.querySelector('#vision');
const layoutDefaults = {preset:'worlds',scoreX:390,scoreY:0,scoreWidth:1140,effectX:710,effectY:124,draftRailWidth:386,draftTopHeight:200,draftBottomHeight:228};
let targets=[], targetReference;
let profiles=[], profile, regions=[], source=null, sourceKind='', stream=null;
let scanBusy=false, scanTimer=null, sourceVersion=0, rows=[], previousValues=new Map(), binding=null;
let selectedRegion=0, pointerStart=null, regionDrawing=false;
vision.innerHTML=`
 <article class="panel"><h2>OBS配信・OCR動作チェック</h2><p>OBSには /overlay をブラウザソースで追加します。ゲーム映像はOBSで取得し、OCRには合成前のゲーム画面を指定します。</p><a href="/obs" target="_blank">OBS設定・本番出力・OCRエンジン検査を開く ↗</a><p id="ocr-diagnostics" role="status">実ゲームOCR: 未実行</p><p class="hint">エンジン検査のPASSと、実ゲーム画面の読取精度は別です。下の切出し画像と候補を比較してください。</p></article>
 <div class="two-col">
  <article class="panel"><h2>目指す大会配信の完成イメージ</h2><p>保存した大会画像は出力デザインの参考です。OCRへは読み込みません。</p>
   <label>完成イメージ<select id="reference-select"></select></label><img id="reference-target" class="reference-target" alt="大会配信の完成参考">
   <p id="reference-source" class="hint"></p>
   <div class="button-row"><button id="reference-scene">このシーンをプレビュー</button></div>
   <label class="check"><input id="reference-show" type="checkbox">取得元をプレビュー背景に表示（本番には表示しません）</label>
   <label>表示配置<select id="layout-preset"><option value="worlds">大会参考配置 / 中央カメラを残すBAN・PICK</option><option value="classic">初期配置 / BAN・PICK全面</option></select></label>
   <details><summary>配置を調整（1920×1080座標）</summary><div id="layout-fields" class="layout-fields"></div><button id="layout-reset">大会参考配置に戻す</button></details>
  </article>
  <article class="panel"><h2>ゲーム画面 → OCR → 配信表示</h2><label>ゲーム側の読取枠<select id="vision-profile"></select></label><p class="hint">初期枠は未調整です。実際のゲームHUD・UIスケールに合わせて枠を移動してください。大会画像の座標は使用しません。</p><p>オーバーレイ合成前のゲーム・リプレイ・映像ウィンドウを選択してください。操作画面やOBSの合成結果は選ばないでください。</p>
   <div class="button-row"><button id="capture-start">元映像のウィンドウを選択</button><button id="capture-stop">取得停止</button></div>
   <label>ローカル画像・動画<input id="source-file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"></label>
   <video id="source-video" controls muted playsinline hidden></video>
   <label class="check"><input id="source-confirm" type="checkbox">選択した取得元はゲームの元画面です（大会配信や合成結果ではありません）</label>
   <p class="hint">16:9の映像に対応。OCRはPC内のみで処理します。画像ファイルも、装飾前のゲーム画面を使用してください。</p>
  </article>
 </div>
 <article class="panel"><div class="panel-heading"><h2>取得元・読取枠</h2><span id="source-status" class="badge">未選択</span></div>
  <div class="source-view"><canvas id="source-canvas" width="1920" height="1080"></canvas><canvas id="roi-canvas" width="1920" height="1080"></canvas></div>
  <div class="roi-toolbar"><label>調整する読取枠<select id="region-select"></select></label><label class="check"><input id="region-draw" type="checkbox">画像上でドラッグして枠を変更</label><button id="regions-reset">読取枠を初期値に戻す</button></div>
  <div id="region-coordinates" class="layout-fields"></div>
  <p class="hint">選手1〜5は画面の上から順です。読取枠の変更も画面上部の反映ボタンでローカル保存されます。チャンピオン画像・BANアイコン・オブジェクトアイコンの識別はOCRの対象外です。</p>
  <div class="button-row"><button id="scan-once" class="primary">OCRを1回実行</button><button id="scan-auto">連続読取を開始</button><button id="scan-stop">連続読取を停止</button><span id="scan-status" role="status">読取待機中</span></div>
 </article>
 <article class="panel"><div class="panel-heading"><h2>認識候補の確認</h2><button id="accept-ocr" class="primary">選択した候補を下書きへ</button></div>
  <p>OCRは誤読することがあります。「2方式一致」や「連続一致」は精度保証ではありません。元画像と比較して取り込む項目にチェックしてください。本番反映・勝敗確定・取得数加算は自動で行いません。</p>
  <div class="ocr-table-wrap"><table class="ocr-table"><thead><tr><th>採用</th><th>項目</th><th>読取時の切出し</th><th>認識文字</th><th>候補</th><th>確認情報</th></tr></thead><tbody id="ocr-results"><tr><td colspan="6">画像または元映像を選び、OCRを実行してください。</td></tr></tbody></table></div>
 </article>`;
const v = id=>document.getElementById(id);
const canvas=v('source-canvas'), ctx=canvas.getContext('2d'), roi=v('roi-canvas'), roiCtx=roi.getContext('2d');
const video=v('source-video');

async function initVision(){
 try{
  const [p,r]=await Promise.all([fetch('/profiles'),fetch('/references/catalog')]);
  if(!p.ok||!r.ok)throw Error();profiles=await p.json();targets=await r.json();
  v('vision-profile').innerHTML=profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  v('reference-select').innerHTML=targets.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  selectProfile(profiles[0].id);selectReference(targets[0].id);
 }catch{v('scan-status').textContent='設定を読み込めません。サーバーを再起動してください。';}
}
function selectReference(id){
 targetReference=targets.find(p=>p.id===id);if(!targetReference)return;
 v('reference-target').src=targetReference.image;
 v('reference-source').innerHTML=`完成参考のみ · <a href="${esc(targetReference.sourcePage)}" target="_blank" rel="noopener">掲載元 ↗</a> / <a href="${esc(targetReference.image)}" target="_blank" rel="noopener">画像を開く ↗</a>`;
}
function selectProfile(id){
 stopScanning();sourceVersion++;rows=[];binding=null;previousValues.clear();
 profile=profiles.find(p=>p.id===id);if(!profile)return;
 regions=structuredClone(draft?.ocrRegions?.[id]||profile.regions);selectedRegion=0;
 refreshRegions();renderCandidates();
}
function refreshLayout(){
 if(!draft)return;const l={...layoutDefaults,...draft.layout};v('layout-preset').value=l.preset;
 const labels={scoreX:'スコア X',scoreY:'スコア Y',scoreWidth:'スコア 幅',effectX:'演出 X',effectY:'演出 Y',draftRailWidth:'BAN・PICK 左右幅',draftTopHeight:'BAN・PICK 上部高',draftBottomHeight:'BAN・PICK 下部高'};
 v('layout-fields').innerHTML=Object.entries(labels).map(([k,label])=>`<label>${label}<input type="number" step="1" min="0" max="1920" data-layout="${k}" value="${l[k]}"></label>`).join('');
}
function changeLayout(){draft.layout={...layoutDefaults,...draft.layout,preset:v('layout-preset').value};changed();}
v('layout-preset').addEventListener('change',changeLayout);
v('layout-fields').addEventListener('input',e=>{if(!e.target.dataset.layout||!e.target.checkValidity())return;draft.layout={...layoutDefaults,...draft.layout,[e.target.dataset.layout]:Number(e.target.value)};changed();});
v('layout-reset').addEventListener('click',()=>{draft.layout={...layoutDefaults};refreshLayout();changed();});
addEventListener('vision-open',()=>{refreshLayout();if(profile){regions=structuredClone(draft?.ocrRegions?.[profile.id]||profile.regions);refreshRegions();}});
v('reference-select').addEventListener('change',e=>selectReference(e.target.value));
v('vision-profile').addEventListener('change',e=>selectProfile(e.target.value));
v('reference-scene').addEventListener('click',()=>{if(!targetReference)return;draft.scene=targetReference.scene;draft.layout={...layoutDefaults,...draft.layout};changed();message('参考画面に対応するシーンをプレビューしています。');});

function stopScanning(){if(scanTimer)clearTimeout(scanTimer);scanTimer=null;v('scan-auto').dataset.running='';v('scan-auto').textContent='連続読取を開始';}
function clearSource(){stopScanning();sourceVersion++;binding=null;rows=[];previousValues.clear();if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.removeAttribute('src');video.hidden=true;source=null;sourceKind='';v('source-confirm').checked=false;v('reference-show').checked=false;document.querySelector('#reference-bg').hidden=true;ctx.clearRect(0,0,1920,1080);drawRegions();renderCandidates();v('source-status').textContent='未選択';}
function setImage(image,label){clearSource();source=image;sourceKind='image';v('source-status').textContent=label;drawSource();}
v('source-file').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 const url=URL.createObjectURL(file);
 if(file.type.startsWith('image/')){const img=new Image();try{img.src=url;await img.decode();if(Math.abs(img.width/img.height-16/9)>.035)throw Error('16:9の画像を指定してください。');setImage(img,file.name);}catch(err){message(err.message,true);}finally{URL.revokeObjectURL(url);}}
 else if(['video/mp4','video/webm'].includes(file.type)){clearSource();video.src=url;video.hidden=false;source=video;sourceKind='video';v('source-status').textContent=file.name;video.onloadeddata=()=>{drawSource();URL.revokeObjectURL(url);};}
 else{URL.revokeObjectURL(url);message('PNG / JPEG / WebP / MP4 / WebMを選んでください。',true);}
});
v('capture-start').addEventListener('click',async()=>{
 try{
  if(!navigator.mediaDevices?.getDisplayMedia)throw Error('このブラウザは画面取得に対応していません。ChromeまたはEdgeで操作画面を開いてください。');
  const selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false});
  clearSource();stream=selected;video.srcObject=stream;await video.play();source=video;sourceKind='capture';
  v('source-status').textContent=stream.getVideoTracks()[0].label||'ウィンドウ取得中';
  stream.getVideoTracks()[0].addEventListener('ended',()=>{clearSource();v('scan-status').textContent='画面取得を終了しました。';});drawSource();
 }catch(err){message(err.name==='NotAllowedError'?'画面取得は開始されていません。':err.message,true);}
});
v('capture-stop').addEventListener('click',clearSource);
v('source-confirm').addEventListener('change',()=>{if(!v('source-confirm').checked)stopScanning();});
function drawSource(){
 if(!source)return false;const w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;
 if(!w||!h)return false;
 if(Math.abs(w/h-16/9)>.035){v('scan-status').textContent=`取得元は${w}×${h}です。16:9の映像ウィンドウを指定してください。`;return false;}
 ctx.drawImage(source,0,0,1920,1080);drawRegions();
 if(v('reference-show').checked){const bg=document.querySelector('#reference-bg');bg.src=canvas.toDataURL('image/jpeg',.85);bg.hidden=false;}
 return true;
}
v('reference-show').addEventListener('change',()=>{document.querySelector('#reference-bg').hidden=!v('reference-show').checked;drawSource();});
setInterval(()=>{if(source&&(sourceKind==='capture'||sourceKind==='video')&&!vision.hidden)drawSource();},500);

function refreshRegions(){v('region-select').innerHTML=regions.map((r,i)=>`<option value="${i}">${esc(r.label||r.id)}</option>`).join('');v('region-select').value=selectedRegion;regionFields();drawRegions();}
function regionFields(){const region=regions[selectedRegion];if(!region)return;v('region-coordinates').innerHTML=region.rect.map((n,i)=>`<label>${['X','Y','幅','高さ'][i]}<input type="number" min="0" max="1920" step="1" data-coordinate="${i}" value="${n}"></label>`).join('');}
function saveRegions(){draft.ocrRegions={...draft.ocrRegions,[profile.id]:structuredClone(regions)};sourceVersion++;rows=[];binding=null;previousValues.clear();changed();renderCandidates();drawRegions();}
v('region-select').addEventListener('change',e=>{selectedRegion=Number(e.target.value);regionFields();drawRegions();});
v('region-coordinates').addEventListener('input',e=>{if(e.target.dataset.coordinate===undefined||!e.target.checkValidity())return;regions[selectedRegion].rect[Number(e.target.dataset.coordinate)]=Number(e.target.value);saveRegions();});
v('regions-reset').addEventListener('click',()=>{regions=structuredClone(profile.regions);selectedRegion=0;saveRegions();refreshRegions();});
v('region-draw').addEventListener('change',e=>{regionDrawing=e.target.checked;roi.style.cursor=regionDrawing?'crosshair':'default';});
function position(e){const box=roi.getBoundingClientRect();return [Math.max(0,Math.min(1919,Math.round((e.clientX-box.left)/box.width*1920))),Math.max(0,Math.min(1079,Math.round((e.clientY-box.top)/box.height*1080)))];}
roi.addEventListener('pointerdown',e=>{if(!regionDrawing||!regions.length)return;pointerStart=position(e);roi.setPointerCapture(e.pointerId);});
roi.addEventListener('pointerup',e=>{if(!pointerStart)return;const end=position(e),[x,y]=pointerStart;pointerStart=null;const rect=[Math.min(x,end[0]),Math.min(y,end[1]),Math.abs(end[0]-x),Math.abs(end[1]-y)];if(rect[2]<4||rect[3]<4)return;regions[selectedRegion].rect=rect;saveRegions();regionFields();});
function drawRegions(){roiCtx.clearRect(0,0,1920,1080);regions.forEach((r,i)=>{roiCtx.strokeStyle=i===selectedRegion?'#d9ff71':r.side==='blue'?'#52c7ed':'#ff92aa';roiCtx.lineWidth=i===selectedRegion?4:2;roiCtx.strokeRect(...r.rect);roiCtx.fillStyle=roiCtx.strokeStyle;roiCtx.font='16px Segoe UI';roiCtx.fillText(String(i+1),r.rect[0],Math.max(16,r.rect[1]-4));});}

async function scan(){
 if(scanBusy)return;
 if(!source||!drawSource())throw Error('16:9の取得元画像・映像を選択してください。');
 if(!v('source-confirm').checked)throw Error('大会配信ではなく、ゲームの元画面を選択したことを確認してください。');
 if(regions.some(r=>{const [x,y,w,h]=r.rect;return !r.rect.every(Number.isInteger)||x<0||y<0||w<1||h<1||x+w>1920||y+h>1080;}))throw Error('読取枠は1920×1080の内側で、幅・高さを1以上にしてください。');
 scanBusy=true;v('scan-once').disabled=true;v('scan-status').textContent='ローカルOCRを実行中…';
 const frozen=document.createElement('canvas');frozen.width=1920;frozen.height=1080;frozen.getContext('2d').drawImage(canvas,0,0);
 const capturedRegions=structuredClone(regions),capturedAt=new Date();
 const crops=new Map(capturedRegions.map(r=>{const [x,y,w,h]=r.rect,c=document.createElement('canvas');c.width=Math.max(1,w);c.height=Math.max(1,h);c.getContext('2d').drawImage(frozen,x,y,w,h,0,0,w,h);return [r.id,c.toDataURL('image/png')];}));
 rows=[];binding=null;renderCandidates();
 const version=sourceVersion, captureBinding={matchId:draft.matchId,sides:{...draft.sides},scene:profile.scene,profileId:profile.id};
 try{const response=await fetch('/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:frozen.toDataURL('image/png'),regions:capturedRegions})});const result=await response.json();if(!response.ok)throw Error(result.error);
  if(version!==sourceVersion)return;
  rows=result.rows.map(r=>({...r,crop:crops.get(r.id)}));binding=captureBinding;
  v('ocr-diagnostics').textContent=`実ゲームOCR実行済み · ${capturedAt.toLocaleTimeString('ja-JP')}取得 · ${result.engine} · OCR入力 ${result.imageSize.join('×')} · 処理 ${result.elapsedMs}ms · 候補 ${rows.filter(r=>r.value!==null).length}/${rows.length} · 不一致 ${rows.filter(r=>r.status==='conflict').length} · 読取不能 ${rows.filter(r=>r.status==='unreadable').length}（精度は未判定・目視比較が必要）`;
  for(const r of rows){r.stable=r.value!==null&&JSON.stringify(previousValues.get(r.id))===JSON.stringify(r.value);previousValues.set(r.id,r.value);}
  renderCandidates();v('scan-status').textContent=`${rows.filter(r=>r.value!==null).length} / ${rows.length}項目の候補 · ${(result.elapsedMs/1000).toFixed(1)}秒 · 要目視確認`;
 }catch(e){v('ocr-diagnostics').textContent='OCRエラー: '+e.message;throw e;}finally{scanBusy=false;v('scan-once').disabled=false;}
}
function renderCandidates(){v('ocr-results').innerHTML=rows.length?rows.map((r,i)=>`<tr><td><input aria-label="${esc(r.label||r.id)}を採用" type="checkbox" data-result="${i}" ${r.value===null?'disabled':''}></td><td>${esc(r.label||r.id)}</td><td>${r.crop?`<img class="ocr-crop" src="${r.crop}" alt="${esc(r.label||r.id)}の読取時画像">`:''}</td><td>${r.raw.map(esc).join('<br>')}</td><td>${r.value===null?'—':r.kind==='winner'?'勝利表記あり':esc(Array.isArray(r.value)?r.value.join(' / '):r.value)}</td><td>${r.status==='conflict'?'前処理間で不一致':r.value===null?'読取不能・値を保持':r.agreement?'2方式一致':'単方式のみ'}${r.stable?' / 連続一致':''}</td></tr>`).join(''):'<tr><td colspan="6">読取結果はまだありません。</td></tr>';}
v('scan-once').addEventListener('click',()=>scan().catch(e=>{v('scan-status').textContent=e.message;}));
v('scan-auto').addEventListener('click',()=>{if(v('scan-auto').dataset.running)return;v('scan-auto').dataset.running='yes';v('scan-auto').textContent='連続読取中（候補のみ）';async function next(){try{await scan();}catch(e){v('scan-status').textContent=e.message;stopScanning();}if(v('scan-auto').dataset.running)scanTimer=setTimeout(next,3000);}next();});
v('scan-stop').addEventListener('click',()=>{stopScanning();v('scan-status').textContent='連続読取を停止しました。';});
v('accept-ocr').addEventListener('click',()=>{
 if(!binding||binding.matchId!==draft.matchId||JSON.stringify(binding.sides)!==JSON.stringify(draft.sides)){message('試合またはサイドが変わりました。OCRを読み直してください。',true);return;}
 let count=0;for(const input of vision.querySelectorAll('[data-result]:checked')){const r=rows[Number(input.dataset.result)];if(r.value===null)continue;const id=binding.sides[r.side];if(r.field==='winner'){draft.winner=id;}else if(r.kind==='kda'){const p=draft.teams[id].players[Number(r.field.split('.')[1])];[p.kills,p.deaths,p.assists]=r.value;}else assign(`teams.${id}.${r.field}`,r.value);count++;}
 if(!count){message('採用する候補にチェックしてください。',true);return;}
 if(binding.scene==='result'&&rows.some((r,i)=>r.field.endsWith('.damage')&&vision.querySelector(`[data-result="${i}"]:checked`)))draft.damageLabel='総ダメージ（取得元の集計対象を確認）';
 changed();message(`${count}項目を下書きへ取り込みました。本番へ反映する前に内容を確認してください。`);
});
initVision();
