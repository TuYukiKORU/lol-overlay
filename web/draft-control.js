function championSlot(side,kind,slot,value,label){
 const c=Champions.find(value),active=Champions.active(draft);
 const selected=active&&active.side===side&&active.kind===kind&&active.slot===slot;
 return `<div class="champion-slot ${selected?'current-slot':''}"><button data-champion-slot="${side},${kind},${slot}" class="slot-select">${c?`<img src="${c.image}" alt="">`:'<span class="empty-portrait">＋</span>'}<span><small>${esc(label)}</small><strong>${esc(c?.name||value||'チャンピオンを選択')}</strong></span></button><button data-clear-slot="${side},${kind},${slot}" aria-label="${esc(label)}を解除">×</button></div>`;
}
function renderDraftControls(){
 const flow=draft.draftFlow||{enabled:false,step:0},step=Champions.active(draft);
 return `<article class="panel draft-progress"><h2>BAN / PICK 進行</h2><p>2段階BAN・全20手順。選択後に「確定して次へ」で進めます。戻る操作は選択を保持し、枠を選び直して修正できます。</p><div class="button-row"><button data-draft-command="start">空のドラフトを開始</button><button data-draft-command="toggle">${flow.enabled?'進行表示を隠す':'進行表示を出す'}</button></div><div class="draft-step-label ${step?.side||''}">${flow.enabled?(step?Champions.label(step)+' · '+esc(draft.teams[draft.sides[step.side]].name):'DRAFT COMPLETE / 全選択完了'):'進行表示OFF · 各枠を自由に編集できます'}</div><div class="button-row"><button data-draft-command="back" ${!flow.enabled||flow.step===0?'disabled':''}>一手戻る</button><button data-draft-command="choose" ${!step?'disabled':''}>現在の枠を選択</button><button data-draft-command="next" ${!step?'disabled':''}>確定して次へ</button></div><label>手順へ移動（既存の選択は保持）<select id="draft-step">${Champions.steps.map((v,i)=>`<option value="${i}" ${flow.step===i?'selected':''}>${i+1}. ${Champions.label(v)}</option>`).join('')}<option value="20" ${flow.step===20?'selected':''}>完了</option></select></label><p class="hint">プレビューで確認後、上部の反映ボタンで配信表示を更新します。進行はタイマーで自動更新されません。</p></article><div class="two-col">${['blue','red'].map(side=>{const t=draft.teams[draft.sides[side]];return `<article class="panel ${side}"><h2>${esc(t.name)}</h2>${t.players.map((p,i)=>championSlot(side,'pick',i,p.champion,`PICK ${i+1} · ${p.name}`)).join('')}<h3>BAN</h3>${t.bans.map((v,i)=>championSlot(side,'ban',i,v,`BAN ${i+1}`)).join('')}</article>`;}).join('')}</div>`;
}
async function openChampionPicker(step){
 try{await Champions.ready;}catch(e){message(e.message,true);return;}
 const modal=document.createElement('dialog');modal.className='champion-picker';
 modal.innerHTML=`<div class="panel-heading"><h2>${Champions.label(step)} · チャンピオン選択</h2><button id="close-picker">閉じる</button></div><label>日本語・英語名で検索<input id="champion-search" type="search" placeholder="アーリ / Ahri" autocomplete="off"></label><p class="hint">${Champions.items.length}体 · 他のBAN / PICKで使用中のチャンピオンは選択できません。</p><div class="champion-grid"></div>`;
 const close=()=>{modal.close();modal.remove();};modal.querySelector('#close-picker').onclick=close;modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function draw(){const query=Champions.normalize(modal.querySelector('input').value);modal.querySelector('.champion-grid').innerHTML=Champions.items.filter(c=>[c.id,c.name,c.nameEn].some(v=>Champions.normalize(v).includes(query))).map(c=>{const used=Champions.used(draft,c.id,step);return `<button data-champion="${c.id}" ${used?'disabled':''} title="${esc(c.nameEn)}${used?' / 使用中':''}"><img src="${c.image}" alt="" loading="lazy"><strong>${esc(c.name)}</strong><small>${esc(c.nameEn)}${used?' · 使用中':''}</small></button>`;}).join('')||'<p>一致するチャンピオンがありません。</p>';}
 modal.querySelector('input').addEventListener('input',draw);
 modal.querySelector('.champion-grid').addEventListener('click',e=>{const b=e.target.closest('[data-champion]');if(!b||b.disabled)return;Champions.set(draft,step,b.dataset.champion);changed();render();close();});
 document.body.append(modal);draw();modal.showModal();modal.querySelector('input').focus();
}
$('#editor').addEventListener('click',async e=>{
 const slot=e.target.closest('[data-champion-slot],[data-clear-slot]');
 if(slot){const [side,kind,index]=(slot.dataset.championSlot||slot.dataset.clearSlot).split(',');const step={side,kind,slot:Number(index)};if(slot.dataset.clearSlot){Champions.set(draft,step,'');changed();render();}else openChampionPicker(step);return;}
 const button=e.target.closest('[data-draft-command]');if(!button)return;
 const command=button.dataset.draftCommand;
 draft.draftFlow??={enabled:false,step:0};const flow=draft.draftFlow;
 if(command==='start'){if(!await confirmAction('下書きのBAN・PICKを空にして、BLUEのBANから開始しますか？'))return;for(const step of Champions.steps)Champions.set(draft,step,'');flow.enabled=true;flow.step=0;draft.scene='draft';draft.cover.visible=false;}
 if(command==='toggle')flow.enabled=!flow.enabled;
 if(command==='back')flow.step=Math.max(0,flow.step-1);
 if(command==='choose'){const step=Champions.active(draft);if(step)openChampionPicker(step);return;}
 if(command==='next'){const step=Champions.active(draft);if(!step)return;const value=Champions.get(draft,step);if(!value){message('現在の枠のチャンピオンを選んでください。',true);return;}if(Champions.used(draft,value,step)){message('他のBAN / PICKと重複しています。選び直してください。',true);return;}flow.step=Math.min(20,flow.step+1);}
 changed();render();
});
$('#editor').addEventListener('change',e=>{if(e.target.id==='draft-step'){draft.draftFlow={enabled:true,step:Number(e.target.value)};changed();render();}});
Champions.ready.then(()=>{if(tab==='draft')render();}).catch(e=>message(e.message,true));
