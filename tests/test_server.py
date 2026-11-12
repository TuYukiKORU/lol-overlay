import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

from server import Store, initial_state, validate, handler_for, LocalServer


class StateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'live.json'
        self.store = Store(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_preview_is_independent_and_unknowns_remain_unknown(self):
        snapshot = self.store.read()
        snapshot['state']['teams']['a']['kills'] = 19
        self.assertIsNone(self.store.read()['state']['teams']['a']['kills'])
        self.assertFalse(self.path.exists())

    def test_swap_keeps_team_records_and_roster(self):
        state = initial_state()
        state['teams']['a']['kills'] = 7
        state['teams']['a']['players'][0]['name'] = '選手一'
        state['events'] = [dict(id='record-1', team='a', kind='dragon')]
        state['sides'] = dict(blue='b', red='a')
        self.store.publish(state, 0)
        restored = Store(self.path).read()['state']
        self.assertEqual(restored['teams']['a']['kills'], 7)
        self.assertEqual(restored['teams']['a']['players'][0]['name'], '選手一')
        self.assertEqual(restored['events'][0]['team'], 'a')
        self.assertEqual(restored['sides']['red'], 'a')

    def test_effect_replay_does_not_add_records(self):
        state = initial_state()
        state['effect'] = dict(id='effect-1', team='a', kind='baron', until=5000)
        self.store.publish(state, 0)
        state['effect']['id'] = 'effect-2'
        self.store.publish(state, 1)
        self.assertEqual(self.store.read()['state']['events'], [])
        self.assertIsNone(Store(self.path).read()['state']['effect'])

    def test_logo_and_results_restore(self):
        state = initial_state()
        state['teams']['a']['logo'] = 'data:image/png;base64,aGVsbG8='
        state['teams']['a']['players'][0]['damage'] = 32800
        state['winner'] = 'a'
        state['cover']['visible'] = True
        state['scene'] = 'result'
        self.store.publish(state, 0)
        self.assertEqual(Store(self.path).read()['state'], state)

    def test_reject_invalid_data_without_changing_disk(self):
        state = initial_state()
        self.store.publish(state, 0)
        original = self.path.read_bytes()
        for value in (-1, '42', True, 1.5):
            bad = copy.deepcopy(state)
            bad['teams']['a']['kills'] = value
            with self.assertRaises(ValueError):
                self.store.publish(bad, 1)
        bad = copy.deepcopy(state)
        bad['events'] = [dict(id='same', team='a', kind='dragon')] * 2
        with self.assertRaises(ValueError):
            self.store.publish(bad, 1)
        self.assertEqual(self.path.read_bytes(), original)

    def test_conflict_does_not_overwrite(self):
        self.store.publish(initial_state(), 0)
        with self.assertRaises(RuntimeError):
            self.store.publish(initial_state(), 0)
        self.assertEqual(self.store.read()['revision'], 1)

    def test_corrupt_save_is_not_silently_overwritten(self):
        self.path.write_text('{broken', encoding='utf-8')
        with self.assertRaises(ValueError):
            Store(self.path)
        self.assertEqual(self.path.read_text(), '{broken')


class HostTests(unittest.TestCase):
    def test_second_host_cannot_bind_same_port(self):
        first=LocalServer(('127.0.0.1',0),BaseHandlerForTest)
        try:
            with self.assertRaises(OSError):
                second=LocalServer(('127.0.0.1',first.server_port),BaseHandlerForTest)
                second.server_close()
        finally:
            first.server_close()

    def test_local_transport_and_origin_protection(self):
        with tempfile.TemporaryDirectory() as tmp:
            server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(Store(Path(tmp)/'live.json')))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                for path in ('/', '/overlay', '/app.js', '/overlay.js', '/vision.js', '/style.css', '/layouts.css','/profiles','/references/worlds2018-game.jpg'):
                    with urlopen(base+path) as response:
                        self.assertEqual(response.status, 200)
                with urlopen(base+'/state') as response:
                    data = json.load(response)
                req = Request(base+'/publish', data=json.dumps(data).encode(), headers={'Content-Type':'application/json', 'Origin':base})
                with urlopen(req) as response:
                    self.assertEqual(json.load(response)['revision'], 1)
                req = Request(base+'/publish', data=json.dumps(data).encode(), headers={'Content-Type':'application/json', 'Origin':'https://example.com'})
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(req)
                self.assertEqual(rejected.exception.code, 403)
                with self.assertRaises(HTTPError):
                    urlopen(base+'/../server.py')
                with self.assertRaises(HTTPError):
                    urlopen(base+'/references/../server.py')
                bad=Request(base+'/ocr',data=b'{"image":"https://example.com/test.png","regions":[]}',headers={'Content-Type':'application/json','Origin':base})
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(bad)
                self.assertEqual(rejected.exception.code,400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


BaseHandlerForTest = handler_for(None)

if __name__ == '__main__':
    unittest.main()
