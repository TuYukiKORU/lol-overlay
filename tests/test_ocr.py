import base64
import copy
import io
import json
from pathlib import Path
import unittest
from PIL import Image
from ocr import parse_text, read_image, validate_regions
from layout import DEFAULT_LAYOUT, validate_layout
from server import initial_state, validate


class OcrTests(unittest.TestCase):
    def test_amounts_preserve_units_and_decimal_precision(self):
        for text, expected in [('VALUE 54.4k',54400),('66.0K VALUE',66000),('17,200',17200),('0',0),('23.1K',23100)]:
            self.assertEqual(parse_text(text,'amount'),expected)
        for text in ('', '—', '5?.4K', '54,4K', '54.4', 'VALUE', 'O', '23K 45K'):
            self.assertIsNone(parse_text(text,'amount'))

    def test_kda_requires_three_visible_numbers(self):
        self.assertEqual(parse_text('VALUE 0 / 0 / 11','kda'),[0,0,11])
        self.assertEqual(parse_text('VALUE 13/18/26','team_kda'),13)
        for text in ('18 13 48','1/2','1/O/3','7','-1/2/3'):
            self.assertIsNone(parse_text(text,'kda'))

    def test_winner_requires_explicit_unambiguous_word(self):
        self.assertTrue(parse_text('T1 WIN','winner'))
        for text in ('T1', 'WIN LOSS', 'WIND', '23/10/0'):
            self.assertIsNone(parse_text(text,'winner'))

    def test_no_digit_guessing_or_negative_counts(self):
        self.assertEqual(parse_text('VALUE 22,','integer'),22)
        for value in ('O','-1','1.2','777',''):
            self.assertIsNone(parse_text(value,'integer'))

    def test_profiles_are_in_frame_and_safe(self):
        for profile in json.loads(Path('references/profiles.json').read_text(encoding='utf-8')):
            validate_regions(profile['regions'])

    def test_bad_regions_rejected(self):
        valid=dict(id='blue-kills',side='blue',field='kills',kind='integer',rect=[10,10,50,40])
        for replacement in ({'rect':[0,0,2000,20]},{'rect':[float('nan'),0,20,20]}, {'field':'__proto__.polluted'}, {'kind':'text'}, {'id':'../../other'}):
            with self.assertRaises(ValueError):
                validate_regions([{**valid,**replacement}])
        with self.assertRaises(ValueError):
            validate_regions([valid,valid])

    def test_image_type_and_aspect_ratio(self):
        def data(size):
            stream=io.BytesIO();Image.new('RGB',size).save(stream,format='PNG')
            return 'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()
        self.assertEqual(read_image(data((640,360))).size,(640,360))
        for invalid in ('https://example.com/image.png','data:image/png;base64,no!'):
            with self.assertRaises(ValueError):read_image(invalid)
        with self.assertRaises(ValueError):read_image(data((500,500)))

    def test_layout_and_regions_roundtrip_validation(self):
        state=initial_state();state['layout']=copy.deepcopy(DEFAULT_LAYOUT)
        profile=json.loads(Path('references/profiles.json').read_text(encoding='utf-8'))[0]
        state['ocrRegions']={profile['id']:profile['regions']}
        self.assertEqual(validate(state)['ocrRegions'],state['ocrRegions'])
        with self.assertRaises(ValueError):validate_layout({**DEFAULT_LAYOUT,'scoreX':1900})


if __name__=='__main__':unittest.main()
