import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError

from demo import demo_state
from server import Store, LocalServer, handler_for, validate
from ocr import validate_regions


class DemoTests(unittest.TestCase):
    def test_fixture_is_valid_and_scores_are_consistent(self):
        state=validate(demo_state())
        self.assertTrue(state['demo'])
        self.assertEqual(len({p['name'] for t in state['teams'].values() for p in t['players']}),10)
        for key,other in [('a','b'),('b','a')]:
            team=state['teams'][key]
            self.assertTrue(all(p['champion'] and p['damage']>0 for p in team['players']))
            self.assertEqual(team['kills'],sum(p['kills'] for p in team['players']))
            self.assertEqual(team['kills'],sum(p['deaths'] for p in state['teams'][other]['players']))
        state['teams']['a']['name']='edited'
        self.assertEqual(demo_state()['teams']['a']['name'],'AZURE FOX')

    def test_raw_game_profiles_are_separate_from_design_targets(self):
        profiles=json.loads(Path('config/ocr-profiles.json').read_text(encoding='utf-8'))
        self.assertTrue(profiles)
        for profile in profiles:
            self.assertTrue(profile['id'].startswith('game-'))
            self.assertFalse(profile['calibrated'])
            self.assertNotIn('image',profile)
            validate_regions(profile['regions'])

    def test_demo_publish_cannot_change_live_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            live=Store(Path(tmp)/'live.json');demo=Store(Path(tmp)/'demo.json',demo_state)
            initial=live.read()
            server=LocalServer(('127.0.0.1',0),handler_for(live,demo))
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{server.server_port}'
            try:
                with urlopen(base+'/demo/state') as r:data=json.load(r)
                data['state']['teams']['a']['name']='TEST EDIT'
                payload=json.dumps(data).encode()
                def post(path):return urlopen(Request(base+path,data=payload,headers={'Content-Type':'application/json','Origin':base}))
                with post('/demo/publish') as r:self.assertEqual(json.load(r)['revision'],1)
                self.assertEqual(live.read(),initial)
                self.assertFalse((Path(tmp)/'live.json').exists())
                self.assertEqual(Store(Path(tmp)/'demo.json',demo_state).read()['state']['teams']['a']['name'],'TEST EDIT')
                with self.assertRaises(HTTPError) as rejected:post('/publish')
                self.assertEqual(rejected.exception.code,400)
                self.assertEqual(live.read(),initial)
                for path in ('/demo','/demo.js','/demo.css','/demo/sample','/profiles','/references/catalog'):
                    with urlopen(base+path) as r:self.assertEqual(r.status,200)
                with urlopen(base+'/references/catalog') as r:
                    self.assertTrue(all('regions' not in p for p in json.load(r)))
            finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
