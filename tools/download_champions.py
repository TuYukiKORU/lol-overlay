"""Download official static champion portraits and bilingual labels for offline use."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'champions'
BASE = 'https://ddragon.leagueoflegends.com'


def fetch(url):
    with urlopen(url, timeout=60) as response:
        return response.read()


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    version = json.loads(fetch(BASE + '/api/versions.json'))[0]
    catalogs = {}
    for lang in ('ja_JP', 'en_US'):
        raw = fetch(f'{BASE}/cdn/{version}/data/{lang}/champion.json')
        (ROOT / f'{lang}.json').write_bytes(raw)
        catalogs[lang] = json.loads(raw)['data']

    def download(item):
        key, jp = item
        en = catalogs['en_US'][key]
        url = f'{BASE}/cdn/{version}/img/champion/{jp["image"]["full"]}'
        raw = fetch(url)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Invalid PNG: {key}')
        (ROOT / f'{key}.png').write_bytes(raw)
        return dict(id=key, key=jp['key'], name=jp['name'], nameEn=en['name'],
                    title=jp['title'], image=f'/champions/{key}.png', source=url,
                    sha256=hashlib.sha256(raw).hexdigest())

    with ThreadPoolExecutor(max_workers=6) as pool:
        champions = list(pool.map(download, catalogs['ja_JP'].items()))
    manifest = dict(version=version, downloadedAt=datetime.now(timezone.utc).isoformat(),
                    source='https://developer.riotgames.com/docs/lol#data-dragon',
                    champions=sorted(champions, key=lambda c: c['id']))
    (ROOT / 'catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Saved {len(champions)} champion portraits and labels; Data Dragon {version}', flush=True)


if __name__ == '__main__':
    main()
