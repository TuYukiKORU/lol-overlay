const game=document.querySelector('#game'),frame=document.querySelector('#overlay'),viewer=document.querySelector('#viewer'),status=document.querySelector('#status');
let stream=null,state=null,pending=false;
function fit(){const w=Math.min(viewer.clientWidth,viewer.clientHeight*16/9),h=w*9/16;for(const element of [game,frame]){element.style.width=w+'px';element.style.height=h+'px';element.style.left=(viewer.clientWidth-w)/2+'px';element.style.top=(viewer.clientHeight-h)/2+'px';}}
new ResizeObserver(fit).observe(viewer);
function paint(){if(!state)return;const display=structuredClone(state);display.scene='game';display.cover.visible=false;display.effect=null;frame.contentWindow.postMessage({type:'preview',state:display},location.origin);}
frame.addEventListener('load',paint);
async function sync(){try{const demo=document.querySelector('#sample').checked;const r=await fetch(demo?'/demo/state':'/state');if(!r.ok)throw Error();const data=await r.json();if(demo!==document.querySelector('#sample').checked)return;state=data.state;paint();}catch{status.textContent='表示データに接続できません。ローカルサーバーを確認してください。';}}
document.querySelector('#sample').addEventListener('change',sync);setInterval(sync,1000);sync();
function stop(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;game.srcObject=null;document.querySelector('#placeholder').hidden=false;status.textContent='画面取得を終了しました。';}
document.querySelector('#stop').addEventListener('click',stop);
document.querySelector('#capture').addEventListener('click',async()=>{
 if(pending)return;pending=true;
 try{
  if(!navigator.mediaDevices?.getDisplayMedia)throw Error('このブラウザは画面取得に対応していません。同じURLをChromeまたはEdgeで開いてください。');
  const selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:false});
  stop();stream=selected;game.srcObject=stream;await game.play();document.querySelector('#placeholder').hidden=true;
  const track=stream.getVideoTracks()[0];track.addEventListener('ended',()=>{if(stream===selected)stop();});
  const w=game.videoWidth,h=game.videoHeight;fit();
  status.textContent=`取得中: ${track.label||'選択ウィンドウ'} · ${w}×${h}`+(Math.abs(w/h-16/9)>.035?' · 16:9以外のため位置が合わない場合があります。LoLを1920×1080に設定してください。':'');
 }catch(e){status.textContent=e.name==='NotAllowedError'?'画面選択がキャンセルされたか許可されませんでした。ChromeまたはEdgeでもお試しいただけます。':e.message;}finally{pending=false;}
});
document.querySelector('#fullscreen').addEventListener('click',async()=>{try{await viewer.requestFullscreen();}catch{status.textContent='このブラウザでは全画面表示に対応していません。';}});
addEventListener('pagehide',stop);
