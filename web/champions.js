// Shared offline catalog and explicit 20-step, two-ban-phase draft preset.
const Champions = (()=>{
 let items=[],index=new Map();
 const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s'’._-]/g,'');
 const steps=[['blue','ban',0],['red','ban',0],['blue','ban',1],['red','ban',1],['blue','ban',2],['red','ban',2],
 ['blue','pick',0],['red','pick',0],['red','pick',1],['blue','pick',1],['blue','pick',2],['red','pick',2],
 ['red','ban',3],['blue','ban',3],['red','ban',4],['blue','ban',4],
 ['red','pick',3],['blue','pick',3],['blue','pick',4],['red','pick',4]].map(([side,kind,slot])=>({side,kind,slot}));
 const ready=fetch('/champions/catalog.json').then(r=>{if(!r.ok)throw Error('チャンピオン画像一覧を読み込めません');return r.json();}).then(data=>{items=data.champions;for(const c of items)for(const name of [c.id,c.name,c.nameEn])index.set(normalize(name),c);return data;});
 ready.catch(()=>{});
 const find=v=>index.get(normalize(v));
 const get=(s,step)=>{const t=s.teams[s.sides[step.side]];return step.kind==='ban'?t.bans[step.slot]:t.players[step.slot].champion;};
 const set=(s,step,value)=>{const t=s.teams[s.sides[step.side]];if(step.kind==='ban')t.bans[step.slot]=value;else t.players[step.slot].champion=value;};
 const active=s=>s.draftFlow?.enabled && s.draftFlow.step<20?steps[s.draftFlow.step]:null;
 const label=step=>`${step.side==='blue'?'BLUE':'RED'} TEAM ${step.kind.toUpperCase()} ${step.slot+1}`;
 const used=(s,value,except)=>steps.some(step=>!(except&&step.side===except.side&&step.kind===except.kind&&step.slot===except.slot)&&normalize(find(get(s,step))?.id||get(s,step))===normalize(find(value)?.id||value));
 return {ready,steps,find,get,set,active,label,used,normalize,get items(){return items;}};
})();
if(typeof module!=='undefined')module.exports=Champions;
