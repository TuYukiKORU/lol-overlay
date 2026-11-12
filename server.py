"""Local-only overlay host. No game, Riot, or external service connections."""
import argparse
import copy
import json
import os
import sys
import socket
from pathlib import Path
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from layout import DEFAULT_LAYOUT, validate_layout

ROOT = Path(__file__).resolve().parent
OBJECTS = ('dragon', 'baron', 'herald', 'grubs')
DEMO_ART_FILES = {'draft.png', 'game.png', 'result.png', 'cover.png'}
DEMO_ART_DIR = ROOT / 'assets' / 'overlay-art'


class LocalServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can let two hosts share a port and serve stale code.
    allow_reuse_address = False

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def initial_state():
    teams = {}
    for key, name in [('a', 'TEAM A'), ('b', 'TEAM B')]:
        teams[key] = dict(name=name, logo='', kills=None, gold=None,
                          players=[dict(name=f'Player {i+1}', champion='', kills=None,
                                        deaths=None, assists=None, damage=None) for i in range(5)],
                          bans=[''] * 5)
    return dict(schema=1, matchId=str(uuid.uuid4()), scene='game', teams=teams,
                sides={'blue': 'a', 'red': 'b'}, winner=None, events=[],
                cover={'visible': False, 'title': 'まもなく再開します', 'subtitle': 'PLEASE STAND BY'},
                effect=None, damageLabel='総ダメージ（集計対象未設定）', layout=copy.deepcopy(DEFAULT_LAYOUT))


def validate(state):
    if not isinstance(state, dict) or state.get('schema') != 1:
        raise ValueError('対応していない保存形式です')
    if state.get('scene') not in ('game', 'draft', 'result'):
        raise ValueError('表示シーンが不正です')
    if sorted(state.get('sides', {}).values()) != ['a', 'b'] or set(state['sides']) != {'blue', 'red'}:
        raise ValueError('サイド設定が不正です')
    def string(value, limit=100):
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('文字列が長すぎるか形式が不正です')
    def number(value):
        if value is not None and (type(value) is not int or value < 0 or value > 100000000):
            raise ValueError('数値は0以上の整数で入力してください')
    string(state['matchId'])
    string(state['damageLabel'])
    if 'draftFlow' in state:
        flow = state['draftFlow']
        if (not isinstance(flow, dict) or type(flow.get('enabled')) is not bool
                or type(flow.get('step')) is not int or not 0 <= flow['step'] <= 20):
            raise ValueError('BAN / PICK進行設定が不正です')
    if 'layout' in state:
        validate_layout(state['layout'])
    if 'ocrRegions' in state:
        from ocr import validate_regions
        profiles = state['ocrRegions']
        if not isinstance(profiles,dict) or len(profiles)>10:
            raise ValueError('OCR読取枠の保存形式が不正です。')
        for key,regions in profiles.items():
            string(key,60)
            validate_regions(regions)
    if set(state['teams']) != {'a', 'b'}:
        raise ValueError('チーム設定が不正です')
    for team in state['teams'].values():
        string(team['name'])
        string(team['logo'], 3000000)
        if team['logo'] and not team['logo'].startswith(('data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,')):
            raise ValueError('ロゴはPNG・JPEG・WebPのみ対応しています')
        for key in ('kills', 'gold'):
            number(team[key])
        if len(team['players']) != 5 or len(team['bans']) != 5:
            raise ValueError('選手・BANは各5枠です')
        for ban in team['bans']:
            string(ban)
        for player in team['players']:
            string(player['name'])
            string(player['champion'])
            for key in ('kills', 'deaths', 'assists', 'damage'):
                number(player[key])
    if state['winner'] not in (None, 'a', 'b'):
        raise ValueError('勝利チームが不正です')
    if type(state['cover']['visible']) is not bool:
        raise ValueError('ふた絵設定が不正です')
    string(state['cover']['title'])
    string(state['cover']['subtitle'])
    ids = set()
    if len(state['events']) > 1000:
        raise ValueError('取得記録が多すぎます')
    for event in state['events']:
        string(event['id'])
        if event['id'] in ids or event['team'] not in ('a', 'b') or event['kind'] not in OBJECTS:
            raise ValueError('取得記録が不正または重複しています')
        ids.add(event['id'])
    effect = state.get('effect')
    if effect is not None:
        string(effect['id'])
        if effect['team'] not in ('a', 'b') or effect['kind'] not in OBJECTS:
            raise ValueError('演出設定が不正です')
        if type(effect['until']) not in (int, float) or not 0 <= effect['until'] <= 1e15:
            raise ValueError('演出時刻が不正です')
    return state


class Store:
    def __init__(self, path, factory=initial_state):
        self.path = Path(path)
        self.lock = threading.Lock()
        self.revision = 0
        if self.path.exists():
            self.live = validate(json.loads(self.path.read_text(encoding='utf-8')))
            self.live['effect'] = None
        else:
            self.live = factory()

    def read(self):
        with self.lock:
            return dict(revision=self.revision, state=copy.deepcopy(self.live))

    def publish(self, state, revision):
        validate(state)
        with self.lock:
            if revision != self.revision:
                raise RuntimeError('別の操作画面から更新されました。本番を読み込み直してください。')
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
            os.replace(temporary, self.path)
            self.live = copy.deepcopy(state)
            self.revision += 1
            return dict(revision=self.revision, state=copy.deepcopy(self.live))


def handler_for(store, demo_store=None):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body, mime='application/json; charset=utf-8'):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'")
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            expected = f'127.0.0.1:{self.server.server_port}'
            return self.headers.get('Host') == expected and self.headers.get('Origin', f'http://{expected}') == f'http://{expected}'

        def do_GET(self):
            if not self.local_request():
                return self.reply(403, {'error': '127.0.0.1から開いてください'})
            route = urlsplit(self.path).path
            if route == '/state':
                return self.reply(200, store.read())
            if route.startswith('/champions/'):
                catalog_path = ROOT/'assets'/'champions'/'catalog.json'
                if not catalog_path.exists():
                    return self.reply(404, {'error': 'チャンピオン素材が未取得です'})
                if route == '/champions/catalog.json':
                    return self.reply(200, catalog_path.read_bytes())
                catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
                if route not in {c['image'] for c in catalog['champions']}:
                    return self.reply(404, {'error': 'Not found'})
                return self.reply(200, (catalog_path.parent/route.rsplit('/',1)[-1]).read_bytes(), 'image/png')
            if route == '/profiles':
                return self.reply(200, (ROOT/'config'/'ocr-profiles.json').read_bytes())
            if route == '/references/catalog':
                catalog=json.loads((ROOT/'references'/'profiles.json').read_text(encoding='utf-8'))
                return self.reply(200,[{k:v for k,v in p.items() if k!='regions'} for p in catalog])
            if route == '/demo/state' and demo_store is not None:
                return self.reply(200,demo_store.read())
            if route == '/demo/sample':
                from demo import demo_state
                return self.reply(200,demo_state())
            if route.startswith('/demo/art/'):
                name = route.removeprefix('/demo/art/')
                if name in DEMO_ART_FILES:
                    try:
                        image = (DEMO_ART_DIR / name).read_bytes()
                    except OSError:
                        pass
                    else:
                        if image.startswith(b'\x89PNG\r\n\x1a\n'):
                            return self.reply(200, image, 'image/png')
                return self.reply(404, {'error': '素材を読み込めません'})
            if route.startswith('/references/'):
                allowed = {p['image'] for p in json.loads((ROOT/'references'/'profiles.json').read_text(encoding='utf-8'))}
                if route not in allowed:
                    return self.reply(404, {'error':'Not found'})
                path = ROOT/'references'/route.rsplit('/',1)[-1]
                return self.reply(200,path.read_bytes(),'image/png' if path.suffix=='.png' else 'image/jpeg')
            files = {'/': ('index.html', 'text/html; charset=utf-8'),
                     '/obs': ('obs.html', 'text/html; charset=utf-8'),
                     '/obs.js': ('obs.js', 'text/javascript; charset=utf-8'),
                     '/watch': ('watch.html', 'text/html; charset=utf-8'),
                     '/watch.js': ('watch.js', 'text/javascript; charset=utf-8'),
                     '/watch.css': ('watch.css', 'text/css; charset=utf-8'),
                     '/champions.js': ('champions.js', 'text/javascript; charset=utf-8'),
                     '/draft-control.js': ('draft-control.js', 'text/javascript; charset=utf-8'),
                     '/demo': ('demo.html', 'text/html; charset=utf-8'),
                     '/demo.js': ('demo.js', 'text/javascript; charset=utf-8'),
                     '/demo.css': ('demo.css', 'text/css; charset=utf-8'),
                     '/overlay': ('overlay.html', 'text/html; charset=utf-8'),
                     '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                     '/overlay.js': ('overlay.js', 'text/javascript; charset=utf-8'),
                     '/vision.js': ('vision.js', 'text/javascript; charset=utf-8'),
                     '/control.css': ('control.css', 'text/css; charset=utf-8'),
                     '/overlay-art.css': ('overlay-art.css', 'text/css; charset=utf-8'),
                     '/layouts.css': ('layouts.css', 'text/css; charset=utf-8'),
                     '/style.css': ('style.css', 'text/css; charset=utf-8')}
            if route not in files:
                return self.reply(404, {'error': 'Not found'})
            name, mime = files[route]
            self.reply(200, (ROOT / 'web' / name).read_bytes(), mime)

        def do_POST(self):
            if not self.local_request():
                return self.reply(403, {'error': 'ローカル操作のみ許可されています'})
            if self.path not in ('/publish', '/demo/publish', '/ocr', '/ocr/self-test') or self.headers.get('Content-Type') != 'application/json':
                return self.reply(400, {'error': '不正な操作です'})
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= (19000000 if self.path=='/ocr' else 7000000):
                    raise ValueError('データサイズが上限を超えています')
                data = json.loads(self.rfile.read(length))
                if self.path == '/ocr/self-test':
                    from ocr_diagnostics import self_test
                    return self.reply(200, self_test())
                if self.path == '/ocr':
                    from ocr import recognize
                    return self.reply(200, recognize(data['image'], data['regions']))
                if self.path == '/demo/publish':
                    if demo_store is None:
                        raise ValueError('試験用ストアがありません。')
                    data['state']['demo']=True
                    return self.reply(200,demo_store.publish(data['state'],data['revision']))
                if data['state'].get('demo'):
                    raise ValueError('試験データは本番へ反映できません。試験操作画面を使用してください。')
                self.reply(200, store.publish(data['state'], data['revision']))
            except RuntimeError as exc:
                self.reply(409, {'error': str(exc)})
            except (ValueError, KeyError, TypeError, OverflowError) as exc:
                self.reply(400, {'error': f'入力データを確認してください: {exc}'})
            except OSError:
                self.reply(500, {'error': '保存できませんでした。保存先の空き容量・権限を確認してください。'})
            except ImportError:
                self.reply(503, {'error': 'OCR依存ライブラリがありません。setup.batを実行してください。'})

        def log_message(self, *_):
            pass
    return Handler


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    try:
        store = Store(ROOT / 'data' / 'live.json')
        from demo import demo_state
        demo_store = Store(ROOT / 'data' / 'demo.json', demo_state)
        server = LocalServer(('127.0.0.1', args.port), handler_for(store,demo_store))
        print(f'操作画面: http://127.0.0.1:{args.port}/\nOBS: http://127.0.0.1:{args.port}/overlay', flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except (ValueError, OSError, KeyError, TypeError) as exc:
        raise SystemExit(f'起動できません: {exc}\n保存データは上書きしていません。data/live.jsonを確認してください。')
