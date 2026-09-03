#!/usr/bin/env python3
"""Build the upload artifact from the readable source.

The Plethora draft validator has a source-size budget: the same code passes
under roughly 80 KB and is rejected with a generic "unsupported remote
resources" error well above it. The whole Monday-to-Friday week does not fit
under that budget as written, so the artifact is minified.

Prefers terser (real minification, ~40% off). Falls back to a comment and
indentation strip (~18% off) when terser is not installed, which is enough
for a partial week but not the full one.

    npm install terser          # optional, but needed for the full week
    python3 dev/build.py        # writes build/main.js

main.js stays readable in the repo either way; only the artifact is squeezed.
"""
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'main.js')
OUT_DIR = os.path.join(ROOT, 'build')
OUT = os.path.join(OUT_DIR, 'main.js')
LIMIT = 80000

BANNER = ('/* Gym Trainer - built artifact, minified from a readable source.\n'
          '   Source: https://github.com/agharshu17/plethora */\n')


def find_terser():
    for cand in (
        os.path.join(ROOT, 'node_modules', '.bin', 'terser'),
        os.path.join(ROOT, 'dev', 'node_modules', '.bin', 'terser'),
    ):
        if os.path.exists(cand):
            return cand
    return shutil.which('terser')


def strip(src):
    """Fallback: drop comments and leading indentation, nothing else."""
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
        line = re.sub(r'^\s+', ' ', line)
        if not line.strip():
            continue
        out.append(line)
    return '\n'.join(out) + '\n'


def main():
    src = open(SRC).read()
    os.makedirs(OUT_DIR, exist_ok=True)
    terser = find_terser()

    if terser:
        run = subprocess.run(
            [terser, SRC, '--compress', '--mangle', '--format', 'quote_style=1'],
            capture_output=True, text=True)
        if run.returncode != 0:
            sys.stderr.write(run.stderr)
            raise SystemExit('terser failed')
        built = BANNER + run.stdout
        how = 'terser'
    else:
        built = strip(src)
        how = 'strip (terser not installed)'

    open(OUT, 'w').write(built)

    check = subprocess.run(['node', '--check', OUT], capture_output=True, text=True)
    if check.returncode != 0:
        sys.stderr.write(check.stderr)
        raise SystemExit('built file failed node --check')

    print('main.js        %6d bytes' % len(src))
    print('build/main.js  %6d bytes  (%.0f%% of source, via %s)'
          % (len(built), 100.0 * len(built) / len(src), how))
    headroom = LIMIT - len(built)
    print('headroom       %6d bytes under the %d ceiling' % (headroom, LIMIT))
    if headroom < 0:
        print('WARNING: over budget — the draft validator may reject it.')


if __name__ == '__main__':
    main()
