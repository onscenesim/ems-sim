"""Regenerate all i-gel placement animations. Requires NumPy."""
from pathlib import Path
import sys

if __name__ == '__main__':
    sys.dont_write_bytecode = True
    from igel_reference import build

    build(Path(__file__).resolve().parent.parent)
