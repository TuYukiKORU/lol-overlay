const assert=require('node:assert/strict');
const fs=require('node:fs');
const catalog=JSON.parse(fs.readFileSync('assets/champions/catalog.json','utf8'));
global.fetch=async()=>({ok:true,json:async()=>catalog});
const C=require('../web/champions.js');
(async()=>{
 await C.ready;
 const team=()=>({players:Array.from({length:5},()=>({champion:''})),bans:Array(5).fill('')});
 const s={teams:{a:team(),b:team()},sides:{blue:'b',red:'a'},draftFlow:{enabled:true,step:0}};
 assert.equal(C.steps.length,20);
 assert.equal(new Set(C.steps.map(C.label)).size,20);
 assert.equal(C.steps.slice(0,6).every(x=>x.kind==='ban'),true);
 assert.deepEqual(C.steps.slice(12,16).map(x=>x.side),['red','blue','red','blue']);
 assert.deepEqual(C.steps.slice(16).map(x=>x.side),['red','blue','blue','red']);
 assert.equal(C.find('アーリ').id,'Ahri');
 assert.equal(C.find("Kai’Sa").id,'Kaisa');
 for(let i=0;i<20;i++){
  s.draftFlow.step=i;assert.equal(C.active(s),C.steps[i]);
  C.set(s,C.active(s),catalog.champions[i].id);
  assert.equal(C.get(s,C.active(s)),catalog.champions[i].id);
 }
 assert.equal(s.teams.b.bans[0],catalog.champions[0].id);
 assert.equal(C.used(s,catalog.champions[0].nameEn),true);
 assert.equal(C.used(s,catalog.champions[0].id,C.steps[0]),false);
 s.draftFlow.step=20;assert.equal(C.active(s),null);
 s.draftFlow.step=0;assert.equal(C.get(s,C.active(s)),catalog.champions[0].id);
 console.log('Draft order, 20 unique slots, side mapping, aliases, duplicates, rewind and completion passed.');
})();
