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
LIMIT = 92000    # measured: 92.6 KB uploads first try, 93.5 KB needs
                 # retries, 95.9 KB and up always times out. See the note above.


def _segments(src):
    """Split into (is_string, text) runs so rules only touch real code."""
    segs, buf, i, n = [], [], 0, len(src)
    while i < n:
        c = src[i]
        if c in '"\'`':
            segs.append((False, ''.join(buf))); buf = []
            j, q = i + 1, c
            while j < n:
                if src[j] == '\\':
                    j += 2; continue
                if src[j] == q:
                    j += 1; break
                j += 1
            segs.append((True, src[i:j]))
            i = j
            continue
        buf.append(c); i += 1
    segs.append((False, ''.join(buf)))
    return segs


# Whitespace-only rules. Every identifier and every literal survives intact,
# which is what the draft validator needs - minifying instead gets the upload
# rejected outright. See the note at the top of this file.
_RULES = [
    (re.compile(r'(?<=[,:;{\[(])[ ]+'), ''),
    (re.compile(r'[ ]+(?=[)\]}])'), ''),
    (re.compile(r'[ ]*(&&|\|\||===|!==|<=|>=|=>)[ ]*'), r'\1'),
    (re.compile(r'[ ]+(?=[({])'), ''),
]


_CSS_RULES = [
    (re.compile(r'\s*([{};:,])\s*'), r'\1'),
    (re.compile(r';\}'), '}'),
]


def squeeze_css(src):
    """The stylesheet is built by joining string literals. CSS is whitespace
    insensitive around its punctuation, so those particular literals can be
    squeezed further than prose ever could."""
    a = src.find('style.textContent=[')
    if a < 0:
        return src
    b = src.find("].join('')", a)
    if b < 0:
        return src
    head, body, tail = src[:a], src[a:b], src[b:]
    out = []
    for is_str, text in _segments(body):
        if is_str and len(text) > 2:
            q = text[0]
            inner = text[1:-1]
            for pat, rep in _CSS_RULES:
                inner = pat.sub(rep, inner)
            text = q + inner + q
        out.append(text)
    return head + ''.join(out) + tail


def squeeze(src):
    src = squeeze_css(src)
    out = []
    for is_str, text in _segments(src):
        if not is_str:
            for pat, rep in _RULES:
                text = pat.sub(rep, text)
        out.append(text)
    return ''.join(out)


def strip(src):
    """Drop comments and leading indentation, then squeeze safe whitespace."""
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
        line = line.lstrip()
        if not line.strip():
            continue
        out.append(line)
    return squeeze('\n'.join(out) + '\n')


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
