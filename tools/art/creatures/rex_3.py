"""Tiny Rex hero, growth stage 3. Render: blender -b -P tools/art/creatures/rex_3.py -- --mode render"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rex_lib  # noqa: E402

rex_lib.main(3)
