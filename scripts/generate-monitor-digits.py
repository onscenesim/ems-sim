#!/usr/bin/env python3
"""Build the three reference-shaped monitor digits (requires fonttools + brotli).

Run from the repo root. All outlines below are authored here; Inter supplies
only matching em, baseline and tabular advance metrics. The output uses the
same SIL Open Font License distributed in public/fonts/OFL-Inter.txt.
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
reference = TTFont(ROOT / 'public/fonts/InterVariable.woff2')
EM = reference['head'].unitsPerEm
ADVANCE = 1324  # Inter's tabular advance at wght=700, opsz=14.


def one(pen):
    # Broad upper hook, straight stem, and deliberately no baseline foot.
    pen.moveTo((1060, 1490))
    pen.lineTo((1060, 0))
    pen.lineTo((655, 0))
    pen.lineTo((655, 1110))
    pen.qCurveTo((500, 1060), (270, 1060))
    pen.lineTo((270, 1320))
    pen.qCurveTo((620, 1320), (770, 1490))
    pen.closePath()


def six(pen):
    # Upright left side; a short, flat-cut terminal above the rounded bowl.
    pen.moveTo((680, 790))
    pen.lineTo((475, 790))
    pen.qCurveTo((460, 870), (345, 870))
    pen.qCurveTo((200, 870), (200, 650))
    pen.lineTo((200, 555))
    pen.qCurveTo((275, 635), (410, 635))
    pen.qCurveTo((680, 635), (680, 315))
    pen.qCurveTo((680, -10), (340, -10))
    pen.qCurveTo((0, -10), (0, 345))
    pen.lineTo((0, 650))
    pen.qCurveTo((0, 1010), (345, 1010))
    pen.qCurveTo((635, 1010), (680, 790))
    pen.closePath()
    # Tall, rounded rectangular counter, wound opposite to the outer contour.
    pen.moveTo((340, 145))
    pen.qCurveTo((475, 145), (475, 245))
    pen.lineTo((475, 375))
    pen.qCurveTo((475, 480), (340, 480))
    pen.qCurveTo((205, 480), (205, 375))
    pen.lineTo((205, 245))
    pen.qCurveTo((205, 145), (340, 145))
    pen.closePath()


glyphs = {}
for name, draw, transform in [
    ('one', one, (1, 0, 0, 1, 0, 0)),
    ('six', six, (1.56, 0, 0, 1.5, 132, -5)),
    # The nine has the same bowl/terminal geometry, rotated around the cap.
    ('nine', six, (-1.56, 0, 0, -1.5, 1193, 1495)),
]:
    pen = TTGlyphPen(None)
    draw(TransformPen(pen, transform))
    glyphs[name] = pen.glyph()
glyphs['.notdef'] = TTGlyphPen(None).glyph()

builder = FontBuilder(EM, isTTF=True)
builder.setupGlyphOrder(['.notdef', 'one', 'six', 'nine'])
builder.setupCharacterMap({ord('1'): 'one', ord('6'): 'six', ord('9'): 'nine'})
builder.setupGlyf(glyphs)
builder.setupHorizontalMetrics({name: (ADVANCE, getattr(glyph, 'xMin', 0))
                                for name, glyph in glyphs.items()})
builder.setupHorizontalHeader(ascent=reference['hhea'].ascent,
                              descent=reference['hhea'].descent,
                              lineGap=reference['hhea'].lineGap)
builder.setupNameTable({
    'familyName': 'EMS Monitor Digits',
    'styleName': 'Bold',
    'uniqueFontIdentifier': 'EMS Monitor Digits Bold 1.0',
    'fullName': 'EMS Monitor Digits Bold',
    'psName': 'EMSMonitorDigits-Bold',
    'version': 'Version 1.0',
    'licenseDescription': 'SIL Open Font License, Version 1.1; see OFL-Inter.txt.',
    'licenseInfoURL': 'https://openfontlicense.org/',
})
os2 = reference['OS/2']
builder.setupOS2(sTypoAscender=os2.sTypoAscender,
                 sTypoDescender=os2.sTypoDescender,
                 sTypoLineGap=os2.sTypoLineGap,
                 usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent,
                 sxHeight=os2.sxHeight, sCapHeight=os2.sCapHeight,
                 usWeightClass=700, fsSelection=0x20)
builder.setupPost()
builder.font['head'].macStyle = 1
builder.font.flavor = 'woff2'
output = ROOT / 'public/fonts/EMSMonitorDigits.woff2'
builder.save(output)
print(f'Wrote {output} ({output.stat().st_size} bytes)')
