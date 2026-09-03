#!/usr/bin/env python3
"""Build the upload artifact from the readable source.

Strips comments and leading indentation, nothing else. main.js stays readable
in the repo while the uploaded source stays small.

DO NOT MINIFY. Measured against the live draft endpoint:

  * terser output is REJECTED, at any size, with the generic
    "This bit uses unsupported remote resources" error. The identical code
    unminified is accepted. The validator statically analyses the source, and
    mangling defeats it.
  * The size ceiling is NOT ~80 KB. A padded 100 KB source was accepted, as
    was 73.9 KB of real source. Around 160 KB the request fails with
    "Request deadline exceeded", which is a server timeout, not validation.
  * No URLs anywhere in the source, not even in a comment. A GitHub link in a
    build banner was enough to trip the same remote-resources error.

An earlier version of this file claimed an ~80 KB budget and blamed size for
that generic error. Both halves were wrong, and it cost a round of redesign.
The message names remote resources and says nothing about size: trust it and
bisect against the endpoint rather than assuming.

    python3 dev/build.py        # writes build/main.js
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'main.js')
OUT_DIR = os.path.join(ROOT, 'build')
OUT = os.path.join(OUT_DIR, 'main.js')
LIMIT = 100000   # measured accepted; ~160 KB times out server-side


def strip(src):
    """Drop comments and leading indentation. No other transform."""
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
    built = strip(src)
    open(OUT, 'w').write(built)

    check = subprocess.run(['node', '--check', OUT], capture_output=True, text=True)
    if check.returncode != 0:
        sys.stderr.write(check.stderr)
        raise SystemExit('built file failed node --check')

    urls = re.findall(r'https?://', built)
    if urls:
        raise SystemExit('found %d URL(s) in the artifact — the validator will '
                         'reject it as a remote resource' % len(urls))

    print('main.js        %6d bytes' % len(src))
    print('build/main.js  %6d bytes  (%.0f%% of source)'
          % (len(built), 100.0 * len(built) / len(src)))
    print('headroom       %6d bytes under the %d ceiling' % (LIMIT - len(built), LIMIT))
    if len(built) > LIMIT:
        print('WARNING: over budget — the draft upload may time out.')


if __name__ == '__main__':
    main()
