import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from server import initial_state, validate, Store

ROOT = Path(__file__).resolve().parents[1]


class ChampionTests(unittest.TestCase):
    def test_every_official_catalog_entry_has_verified_local_image_and_labels(self):
        folder = ROOT/'assets'/'champions'
        catalog = json.loads((folder/'catalog.json').read_text(encoding='utf-8'))
        official = json.loads((folder/'ja_JP.json').read_text(encoding='utf-8'))
        self.assertEqual(catalog['version'], official['version'])
        self.assertEqual({c['id'] for c in catalog['champions']}, set(official['data']))
        for c in catalog['champions']:
            path = folder / f"{c['id']}.png"
            self.assertTrue(c['name'] and c['nameEn'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), c['sha256'])
            with Image.open(path) as img:
                self.assertEqual(img.size, (128,128))
                img.verify()

    def test_progress_validation_and_restore(self):
        state = initial_state()
        for bad in (None, {}, {'enabled':True,'step':-1}, {'enabled':True,'step':21},
                    {'enabled':True,'step':True}, {'enabled':1,'step':0}):
            state['draftFlow'] = bad
            with self.assertRaises(ValueError): validate(state)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'state.json'
            store = Store(path)
            state['draftFlow'] = {'enabled':True,'step':13}
            store.publish(state,0)
            self.assertEqual(Store(path).read()['state']['draftFlow'],state['draftFlow'])
