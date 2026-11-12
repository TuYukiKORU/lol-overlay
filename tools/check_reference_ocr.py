"""Optional Windows integration check against manually transcribed screenshots."""
import base64
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr import recognize

sys.stdout.reconfigure(encoding='utf-8')
profiles=json.loads((ROOT/'references/profiles.json').read_text(encoding='utf-8'))
expected={
 'worlds2018-game':{'blue-kills':7,'red-kills':22,'blue-gold':54400,'red-gold':66000,
                  **{f'blue-kda-{i}':v for i,v in enumerate([[2,8,2],[3,4,2],[1,3,3],[1,2,3],[0,5,2]])},
                  **{f'red-kda-{i}':v for i,v in enumerate([[9,3,8],[5,0,11],[3,3,10],[5,1,5],[0,0,11]])}},
 'worlds2024-result':{'blue-gold':57000,'red-gold':65600,'blue-kills':13,'red-winner':True,
                     **{f'blue-damage-{i}':v for i,v in enumerate([17200,17700,25300,15800,8900])},
                     **{f'red-damage-{i}':v for i,v in enumerate([23100,13400,15900,19400,13000])}},
}
report=[]
for profile in profiles:
 if profile['id'] not in expected:continue
 path=ROOT/profile['image'].lstrip('/')
 mime='png' if path.suffix=='.png' else 'jpeg'
 result=recognize(f'data:image/{mime};base64,'+base64.b64encode(path.read_bytes()).decode(),profile['regions'])
 actual={r['id']:r['value'] for r in result['rows']}
 differences={key:{'expected':value,'actual':actual.get(key)} for key,value in expected[profile['id']].items() if actual.get(key)!=value}
 report.append({'profile':profile['id'],'checked':len(expected[profile['id']]),'elapsedMs':result['elapsedMs'],'differences':differences,'rows':result['rows']})
 print(profile['id'],len(expected[profile['id']]),'PASS' if not differences else differences)
out=ROOT/'data'/'ocr-reference-report.json';out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
raise SystemExit(1 if any(r['differences'] for r in report) else 0)
