"""1920x1080 output geometry, independent from OCR source rectangles."""
DEFAULT_LAYOUT = dict(preset='worlds', scoreX=390, scoreY=0, scoreWidth=1140,
                      effectX=710, effectY=124, draftRailWidth=386,
                      draftTopHeight=200, draftBottomHeight=228)


def validate_layout(layout):
    if not isinstance(layout, dict) or layout.get('preset') not in ('worlds', 'classic'):
        raise ValueError('配置プリセットが不正です。')
    limits = {'scoreX': (0,1920), 'scoreY':(0,400), 'scoreWidth':(850,1600),
              'effectX':(0,1420), 'effectY':(0,800), 'draftRailWidth':(280,500),
              'draftTopHeight':(120,260), 'draftBottomHeight':(140,280)}
    for key,(low,high) in limits.items():
        value = layout.get(key)
        if type(value) is not int or not low<=value<=high:
            raise ValueError(f'配置の{key}は{low}〜{high}で設定してください。')
    if layout['scoreX']+layout['scoreWidth']>1920:
        raise ValueError('スコア欄が画面右端を超えています。')
    return layout
