#!/usr/bin/env python3
"""Build the upload artifact from the readable source.

main.js stays readable; the artifact stays small. The build strips comments and
indentation, squeezes whitespace outside string literals, joins lines where
automatic semicolon insertion cannot bite, and compresses repeated phrases in
the exercise library and the stylesheet into a table main.js expands at load.

DO NOT MINIFY. terser output is REJECTED at any size with the generic
"This bit uses unsupported remote resources" error, while the identical code
unminified is accepted. The contract explains why: the validator statically
analyses the source, and loader arguments "may be direct literals or simple
const string aliases, never concatenated/template/runtime-built URLs".
Mangling defeats that analysis. Everything this build does is whitespace or
string data - no identifier is ever renamed.

No URLs anywhere in the source, not even in a comment. A link in a build
banner was enough to trip the same error.

SIZE, measured against the live endpoint on 2026-09-04:

  * The published package limit is 2 MiB and is NOT the constraint.
  * The constraint is a ~3 second server-side deadline on the upload, which
    fails with "Request deadline exceeded" (HTTP 504, retryable: true).
  * With THIS manifest, synthetic payloads of 40/60/70/76 KB all uploaded in
    under 3 s; the real Bit at 78-81 KB failed every one of ~20 attempts.
    With a bare manifest the boundary sat higher, around 80-85 KB, and was
    already flaky there (82 KB failed, 85 KB passed, 86 KB failed). So the
    ceiling moves with what the manifest declares - budget for ~76 KB, not
    for the earlier notes in this repo that claimed 80 KB and then 93 KB.
  * It is probabilistic right at the line: the 77,079 byte artifact that
    finally landed took three attempts. Always retry before concluding
    anything about size.

Measure BYTES, not characters: the coaching text is full of multi-byte UTF-8.

    python3 dev/build.py        # writes build/main.js
    node dev/verify.mjs         # prove the artifact still is the same Bit
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
# The measured upload deadline boundary for this manifest. See the note above:
# past this, uploads start returning 504 deadline_exceeded.
SOFT_LIMIT = 77824


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
    # Both-sides-only, so a lone operator inside a regex literal (which is not
    # a string literal and so reaches these rules) is never touched.
    # [ ]* not [ ]+, because an earlier rule may already have eaten one side
    # (the space before a '{' goes first, leaving 'x ={').
    (re.compile(r'(?<![=!<>+\-*/%&|^])[ ]*=[ ]*(?![=>])'), '='),
    (re.compile(r'[ ]+([*/<>])[ ]+'), r'\1'),
    # + and - only when collapsing cannot manufacture a ++ or -- token.
    (re.compile(r'(?<![+\-])[ ]+([+\-])[ ]+(?![+\-])'), r'\1'),
    (re.compile(r'[ ]+([?:])[ ]+'), r'\1'),
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


# Placeholder alphabet: printable ASCII, minus the quote and backslash that
# would need escaping inside a literal, minus the '|' that separates a
# timestamp from its text, and minus the '~' that marks a placeholder.
_ALPHABET = ''.join(c for c in (chr(i) for i in range(35, 127))
                    if c not in "'\\|~`")
# Two marker characters, so the table is not capped at one alphabet's worth.
_MARKERS = '~`' 


def _dict_spans(src):
    """The regions whose string literals main.js will expand again.

    Only these may be compressed. The exercise library is walked at startup,
    and the stylesheet is passed through _x() at its one join. Everything else
    reaches the DOM without ever meeting the expander, so a placeholder left
    there would be shown to the reader verbatim.
    """
    spans = []
    a = src.find('var RIG={')
    if a < 0:
        a = src.find('var RIG =')
    b = src.find('var WEEK=', a) if a >= 0 else -1
    if b < 0 and a >= 0:
        b = src.find('var WEEK =', a)
    if a >= 0 and b > a:
        spans.append((a, b))
    c = src.find('style.textContent=_x([')
    if c < 0:
        c = src.find('style.textContent = _x([')
    if c >= 0:
        d = src.find("].join('')", c)
        if d > c:
            spans.append((c, d))
    return spans


def compress_phrases(src):
    """Replace repeated runs in the exercise library's string literals with
    two-byte placeholders, and hand main.js the table to expand them with.

    This is data compression, not minification: no identifier changes, and
    every literal still appears in full, once, in the emitted table. That
    matters - mangled source is rejected by the draft validator outright.
    """
    spans = _dict_spans(src)
    if not spans:
        return src
    spans.sort()
    # Compress every span against one shared table, so a phrase that appears
    # in both a coaching cue and the stylesheet is only carried once.
    pieces, segs, at = [], [], 0
    for lo, hi in spans:
        pieces.append(src[at:lo])
        segs.append(_segments(src[lo:hi]))
        at = hi
    pieces.append(src[at:])
    # Candidate phrases are scored on what they would actually save: every
    # occurrence after the first collapses to two bytes, and the phrase has
    # to be carried once in the table plus its quotes and comma.
    import collections
    # While compressing, a placeholder is ONE private-use character, so a
    # later phrase can never match half of an earlier one. Emitting '~X'
    # straight away let a candidate match the 'X' of an existing
    # placeholder plus the text after it, which put a stray '~' in the
    # artifact and broke pose parsing. They become '~X' only at the end.
    def _mark(k):
        return chr(0xE000 + k)

    phrases = []
    for _ in range(len(_MARKERS) * len(_ALPHABET)):
        text = ''.join(t for grp in segs for is_str, t in grp if is_str)
        best = None
        for L in range(5, 34):
            seen = collections.Counter()
            for i in range(len(text) - L):
                sub = text[i:i + L]
                if any(ch in sub for ch in "'\\|~`\n"):
                    continue
                if any('\ue000' <= ch <= '\uf8ff' for ch in sub):
                    continue
                seen[sub] += 1
            for sub, c in seen.items():
                if c < 3:
                    continue
                n = len(sub.encode('utf-8'))
                gain = (c - 1) * (n - 2) - n - 3
                if gain > 0 and (best is None or gain > best[0]):
                    best = (gain, sub)
        if best is None or best[0] < 24:
            break
        gain, sub = best
        ph = _mark(len(phrases))
        segs = [[(is_str, t.replace(sub, ph) if is_str else t) for is_str, t in grp]
                for grp in segs]
        phrases.append(sub)

    if not phrases:
        return src

    out = []
    for i, piece in enumerate(pieces):
        out.append(piece)
        if i < len(segs):
            region = ''.join(t for _, t in segs[i])
            for k in range(len(phrases)):
                region = region.replace(
                    _mark(k),
                    _MARKERS[k // len(_ALPHABET)] + _ALPHABET[k % len(_ALPHABET)])
            out.append(region)
    built = ''.join(out)
    leftover = [c for c in built if '\ue000' <= c <= '\uf8ff']
    if leftover:
        raise SystemExit('placeholder left unmapped: %r' % leftover[:4])
    table = ("var _A='" + _ALPHABET[:len(phrases)] + "';"
             "_P=[" + ','.join("'" + p + "'" for p in phrases) + "];\n")
    # The table has to run before the exercise library is built.
    at = built.find('var RIG={')
    return built[:at] + table + built[at:]


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
    # Join a line onto the previous one when the previous one ended in a
    # character that cannot end a statement, so automatic semicolon insertion
    # has nothing to insert. ')' and '}' are deliberately excluded: a line
    # ending in either can be a complete statement, and gluing the next line
    # onto it changes what the program means.
    joined = []
    for line in out:
        if joined and joined[-1][-1:] in (',', ';', '{', '+'):
            joined[-1] += line
        else:
            joined.append(line)
    return squeeze('\n'.join(joined) + '\n')


def main():
    src = open(SRC).read()
    os.makedirs(OUT_DIR, exist_ok=True)
    built = compress_phrases(strip(src))
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
        print('WARNING: past %d bytes uploads start returning 504\n'
              '         deadline_exceeded. That is the upload deadline, not\n'
              '         the 2 MiB package limit. Retry a few times anyway - it\n'
              '         is probabilistic right at the line.' % SOFT_LIMIT)


if __name__ == '__main__':
    main()
