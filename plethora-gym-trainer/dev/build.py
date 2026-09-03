#!/usr/bin/env python3
"""Build the upload artifact from the readable source.

The Plethora draft validator has a source-size budget: the same code passes
under roughly 80 KB and is rejected with a generic "unsupported remote
resources" error well above it. This strips comments and collapses
indentation, which keeps main.js readable in the repo while the uploaded
source stays comfortably inside the budget. It is a whitespace/comment
transform only — no renaming, no restructuring.

    python3 dev/build.py            # writes build/main.js
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'main.js')
OUT_DIR = os.path.join(ROOT, 'build')
OUT = os.path.join(OUT_DIR, 'main.js')


def shrink(src):
    out, in_block = [], False
    for line in src.split('\n'):
        stripped = line.strip()
        if in_block:
            if '*/' in stripped:
                in_block = False
            continue
        if stripped.startswith('/*'):
            if '*/' not in stripped:
                in_block = True
            continue
        if stripped.startswith('//'):
            continue
        if '/*' in line and '*/' in line and '"' not in line and "'" not in line:
            line = re.sub(r'/\*.*?\*/', '', line)
            if not line.strip():
                continue
        line = re.sub(r'^\s+', ' ', line)
        if not line.strip():
            continue
        out.append(line)
    return '\n'.join(out) + '\n'


def main():
    src = open(SRC).read()
    built = shrink(src)
    os.makedirs(OUT_DIR, exist_ok=True)
    open(OUT, 'w').write(built)
    check = subprocess.run(['node', '--check', OUT], capture_output=True, text=True)
    if check.returncode != 0:
        sys.stderr.write(check.stderr)
        raise SystemExit('built file failed node --check')
    print('main.js   %6d bytes' % len(src))
    print('build/main.js %6d bytes  (%.0f%% of source)' % (len(built), 100.0 * len(built) / len(src)))
    if len(built) > 80000:
        print('WARNING: over 80 KB — the draft validator may reject it.')


if __name__ == '__main__':
    main()
