"""Real engine check with known synthetic pixels, isolated from match state."""
import base64
import io
from datetime import datetime, timezone


def self_test():
    from PIL import Image, ImageDraw, ImageFont
    from ocr import recognize
    image = Image.new('RGB', (1920,1080), '#142030')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 48)
    specimens = [('kills','integer','22',22), ('gold','amount','54.4k',54400),
                 ('players.0.kda','kda','3 / 2 / 12',[3,2,12])]
    regions=[]
    for i,(field,kind,text,expected) in enumerate(specimens):
        y=100+i*160
        draw.text((110,y+8),text,font=font,fill='white')
        regions.append(dict(id=f'check-{i}',side='blue',field=field,kind=kind,
                            label=text,rect=[100,y,380,80]))
    buf=io.BytesIO();image.save(buf,format='PNG')
    data='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode('ascii')
    result=recognize(data,regions)
    for row,spec in zip(result['rows'],specimens):
        row['expected']=spec[3]
        row['passed']=row['value']==spec[3]
    return {**result,'passed':all(r['passed'] for r in result['rows']),
            'checkedAt':datetime.now(timezone.utc).isoformat(),
            'scope':'合成文字によるエンジン検査。実ゲームでの認識精度・枠の位置は別途確認が必要です。'}
