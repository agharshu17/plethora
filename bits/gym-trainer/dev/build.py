#!/usr/bin/env python3
"""Build the upload artifact from the readable source.

Strips comments and leading indentation, nothing else. main.js stays readable
in the repo while the uploaded source stays small.

DO NOT MINIFY. terser output is REJECTED at any size with the generic
"This bit uses unsupported remote resources" error, while the identical code
unminified is accepted. The reason is in the published contract: the validator
statically analyses the source, and library/font arguments "may be direct
literals or simple const string aliases, never concatenated/template/
runtime-built URLs". Mangling defeats that analysis, so it reads as a remote
resource. Strip whitespace only - every identifier and literal survives intact.

No URLs anywhere in the source, not even in a comment. A link in a build
banner was enough to trip the same error.

On size: the published package limit is 2 MiB, so this Bit at ~95 KB is
nowhere near it and there is no reason to contort the code to stay small.
An earlier note in this repo claimed an ~80 KB budget and then a ~93 KB one,
and both sent a redesign down the wrong path. What was actually measured was
upload TIMEOUTS ("Request deadline exceeded") starting around 96 KB - a slow
validator, not a size cap, and flaky enough that a passing size often failed
once or twice first. SOFT_LIMIT below is a warning line for that flakiness,
not the contract.

Measure BYTES, not characters: the coaching text is full of multi-byte UTF-8.

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
# The contract's real ceiling. Nothing here is close to it.
CEILING = 2 * 1024 * 1024
# The far lower line where draft uploads were observed to start timing out.
SOFT_LIMIT = 92500


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

    # Measure BYTES, not characters. The coaching text carries multi-byte
    # UTF-8 (the multiplication sign, middot, degree, em dash), so len() on
    # decoded text understates the real payload by several hundred bytes -
    # the difference between comfortably under the ceiling and sitting on it.
    src_b = len(src.encode('utf-8'))
    built_b = len(built.encode('utf-8'))
    print('main.js        %6d bytes' % src_b)
    print('build/main.js  %6d bytes  (%.0f%% of source)'
          % (built_b, 100.0 * built_b / src_b))
    print('package limit  %6d bytes  (%.1f%% used)'
          % (CEILING, 100.0 * built_b / CEILING))
    if built_b > CEILING:
        raise SystemExit('over the %d byte package limit' % CEILING)
    if built_b > SOFT_LIMIT:
        print('note: past %d bytes draft uploads have been seen to time out.\n'
              '      That is validator slowness, not the size limit - retry '
              'before\n      concluding anything about size.' % SOFT_LIMIT)


if __name__ == '__main__':
    main()
