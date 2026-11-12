"""Fictional, internally consistent presentation data. No game input required."""
import copy
import json
from pathlib import Path


def demo_state():
    return copy.deepcopy(json.loads((Path(__file__).parent/'fixtures'/'demo.json').read_text(encoding='utf-8')))
