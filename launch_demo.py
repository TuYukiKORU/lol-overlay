"""Start the local server if needed and open the fictional showcase."""
import json
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:8765'


def ready():
    try:
        with urlopen(BASE + '/demo/state', timeout=1) as response:
            data = json.load(response)
            return data['state'].get('demo') is True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def main():
    if not ready():
        log_path = ROOT / 'data' / 'demo-server.log'
        log_path.parent.mkdir(exist_ok=True)
        with log_path.open('a', encoding='utf-8') as log:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / 'server.py')], cwd=ROOT,
                stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
            )
        for _ in range(40):
            if process.poll() is not None:
                raise SystemExit('起動できません。data/demo-server.log を確認してください。')
            if ready():
                break
            time.sleep(.25)
        else:
            process.terminate()
            raise SystemExit('サーバーの起動がタイムアウトしました。data/demo-server.log を確認してください。')
    webbrowser.open(BASE + '/demo?autoplay=1')
    print('デモ上映を開きました: ' + BASE + '/demo?autoplay=1')


if __name__ == '__main__':
    main()
