"""Region-based, offline OCR. Never mutates match state or infers objectives."""
import base64
import io
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()
ALLOWED_FIELDS = {'kills', 'gold', 'name', 'winner'} | {
    f'players.{i}.{key}' for i in range(5)
    for key in ('name', 'champion', 'damage', 'kda')
}


def validate_regions(regions):
    if not isinstance(regions, list) or not 1 <= len(regions) <= 40:
        raise ValueError('読取枠は1〜40個で設定してください。')
    seen = set()
    for region in regions:
        if not isinstance(region, dict):
            raise ValueError('読取枠の形式が不正です。')
        key = region.get('id')
        if not isinstance(key, str) or not re.fullmatch(r'[a-z0-9_-]{1,60}', key) or key in seen:
            raise ValueError('読取枠IDが不正または重複しています。')
        seen.add(key)
        if region.get('side') not in ('blue', 'red') or region.get('field') not in ALLOWED_FIELDS:
            raise ValueError('読取先が不正です。')
        if region.get('kind') not in ('integer', 'amount', 'kda', 'text', 'winner', 'team_kda'):
            raise ValueError('読取形式が不正です。')
        field = region['field']
        expected = ('integer','team_kda') if field=='kills' else ('winner',) if field=='winner' else ('amount',) if field=='gold' or field.endswith('.damage') else ('kda',) if field.endswith('.kda') else ('text',)
        if region['kind'] not in expected:
            raise ValueError('読取先と読取形式が一致しません。')
        x, y, w, h = region.get('rect', [])
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (x, y, w, h)):
            raise ValueError('読取枠座標が不正です。')
        if not (0 <= x < 1920 and 0 <= y < 1080 and 4 <= w <= 1920 and 4 <= h <= 1080 and x+w <= 1920 and y+h <= 1080):
            raise ValueError('読取枠は1920×1080の範囲内に設定してください。')
    return regions


def parse_text(text, kind):
    text = re.sub(r'\bVALUE\b\s*[:：]?', '', text, flags=re.I).strip()
    if kind == 'text':
        return text[:100] if len(text)>=2 and re.fullmatch(r"[A-Za-z0-9 ._'\-]+",text) and re.search(r'[A-Za-z]',text) else None
    if kind == 'winner':
        return True if re.search(r'\b(?:WIN|VICTORY)\b', text, re.I) and not re.search(r'\b(?:LOSS|LOSE)\b', text, re.I) else None
    normalized = re.sub(r'\s+', '', text).strip('.,:;')
    if kind in ('kda', 'team_kda'):
        match = re.fullmatch(r'(\d{1,3})/(\d{1,3})/(\d{1,3})', normalized)
        if not match:
            return None
        values = [int(v) for v in match.groups()]
        return values[0] if kind == 'team_kda' else values
    if kind == 'integer':
        return int(normalized) if re.fullmatch(r'\d{1,3}', normalized) and int(normalized) <= 150 else None
    if kind == 'amount':
        # Commas are accepted only as thousands separators, never as decimal guesses.
        if re.fullmatch(r'\d{1,3}(?:,\d{3})+', normalized):
            normalized = normalized.replace(',', '')
        match = re.fullmatch(r'(\d+(?:\.\d{1,2})?)([kK]?)', normalized)
        if not match or ('.' in match[1] and not match[2]):
            return None
        value = round(float(match[1]) * (1000 if match[2] else 1))
        return value if value <= 2000000 else None
    return None


def read_image(data_url):
    from PIL import Image, UnidentifiedImageError
    if not isinstance(data_url, str) or len(data_url) > 18000000:
        raise ValueError('画像が大きすぎます。')
    match = re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)', data_url)
    if not match:
        raise ValueError('PNG / JPEG / WebP画像を指定してください。')
    try:
        raw = base64.b64decode(match[1], validate=True)
        im = Image.open(io.BytesIO(raw))
        if im.width > 7680 or im.height > 4320 or im.width < 320 or im.height < 180:
            raise ValueError('画像サイズは320×180〜7680×4320にしてください。')
        if abs(im.width / im.height - 16/9) > 0.035:
            raise ValueError('16:9の元映像を指定してください。余白やウィンドウ枠を除いてください。')
        im.load()
        return im.convert('RGB')
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError('画像を読み込めません。') from exc


def recognize(data_url, regions):
    validate_regions(regions)
    im = read_image(data_url)
    if not LOCK.acquire(blocking=False):
        raise RuntimeError('OCRを実行中です。完了後に再試行してください。')
    started = time.monotonic()
    try:
        from PIL import Image, ImageOps, ImageDraw, ImageFont
        source_size = [im.width, im.height]
        im = im.resize((1920,1080), Image.Resampling.LANCZOS)
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 64)
        items = []
        with tempfile.TemporaryDirectory(prefix='lol-overlay-ocr-') as directory:
            for region in regions:
                x,y,w,h = region['rect']
                sx,sy = im.width/1920, im.height/1080
                crop = im.crop((round(x*sx),round(y*sy),round((x+w)*sx),round((y+h)*sy)))
                factor = (1.5 if region['kind'] in ('text','winner') else
                          min(4, 280/max(crop.height,1), 1800/max(crop.width,1)))
                crop = crop.resize((max(1,round(crop.width*factor)), max(1,round(crop.height*factor))), Image.Resampling.LANCZOS)
                # Contrast variant + unmodified color variant. Disagreement is rejected.
                gray = ImageOps.autocontrast(ImageOps.grayscale(crop))
                if sum(gray.getpixel(p) for p in [(0,0),(gray.width-1,0),(0,gray.height-1)]) / 3 < 128:
                    gray = ImageOps.invert(gray)
                for suffix, image, bg, fg in [('contrast',gray,'white','black'),('color',crop,'black','white')]:
                    if region['kind'] in ('text','winner'):
                        padded = ImageOps.expand(image.convert('RGB'),border=20,fill=bg)
                    else:
                        padded = Image.new('RGB',(image.width+300,max(image.height,90)+40),bg)
                        padded.paste(image,(280,20))
                        ImageDraw.Draw(padded).text((10,(padded.height-116)//2),'VALUE',font=font,fill=fg)
                    path = Path(directory) / f'{region["id"]}-{suffix}.png'
                    padded.save(path)
                    items.append({'id':f'{region["id"]}-{suffix}', 'path':str(path)})
            manifest = Path(directory)/'manifest.json'
            manifest.write_text(json.dumps(items),encoding='utf-8')
            interpreter = ROOT/'.venv'/'Scripts'/'python.exe'
            if not interpreter.exists():
                interpreter = Path(sys.executable)
            result = subprocess.run([str(interpreter), str(ROOT/'tools'/'ocr_worker.py'), str(manifest)],
                                    capture_output=True,text=True,encoding='utf-8',timeout=40,
                                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if result.returncode:
                raise RuntimeError('ローカルOCRを起動できません。setup.batとWindows英語OCR言語を確認してください。 '+result.stderr.strip()[:400])
            recognized = {r['id']:r['text'] for r in json.loads(result.stdout)}
        rows = []
        for region in regions:
            texts = [recognized.get(f'{region["id"]}-{v}','') for v in ('contrast','color')]
            values = [parse_text(t,region['kind']) for t in texts]
            usable = [v for v in values if v is not None]
            conflict = len(usable)==2 and usable[0]!=usable[1]
            value = usable[0] if usable and not conflict else None
            if region['field']=='gold' and isinstance(value,int) and value>250000:
                value=None
            rows.append({**region, 'raw':texts, 'value':value,
                         'status':'conflict' if conflict else 'candidate' if value is not None else 'unreadable',
                         'agreement':len(usable)==2 and not conflict,
                         'confidence':None})
        return {'rows':rows,'elapsedMs':round((time.monotonic()-started)*1000),
                'engine':'Windows OCR · en-US · offline', 'imageSize':source_size}
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('OCRが40秒でタイムアウトしました。読取枠を減らしてください。') from exc
    finally:
        LOCK.release()
