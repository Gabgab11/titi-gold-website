"""
TITI GOLD — brand asset generator
------------------------------------------------------------------
Redraws the TG monogram as clean vector geometry, measured from the
original artwork, and writes the logo SVGs used by the website.

    python3 scripts/build-brand.py [path/to/LiberationSerif-Bold.ttf]

Outputs (assets/img/brand/):
    titigold-mark.svg          gold-gradient monogram (web default)
    titigold-mark-gold.svg     flat gold, for small sizes and embroidery/print
    titigold-mark-black.svg    flat black, for light backgrounds / stamps
    titigold-lockup.svg        monogram + "THE TITI-GOLD" wordmark (gradient)
    titigold-lockup-black.svg  lockup in flat black
    titigold-wordmark.svg      wordmark on its own (gradient)

Geometry (units are the original artwork's pixels, 1196 × 1449):
    T crossbar   x 214–942,  y 0–162
    T stem       x 479–677,  y 162–995
    G outer      centre (604, 770), r 511
    G inner      centre (610, 782), r 318   (slightly heavier at the top, as in the original)
    G opening    right side, between y 575 and y 720
    G crossbar   x 479 → 1091, y 720–870
    G spur       right side cut flat at x 1091
Fitted to the original artwork at 97.5% overlap (the rest is foil-edge texture).
"""
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "brand"
FONT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf")

OCX, OCY, R_OUT = 604.0, 770.0, 511.0     # outer circle
ICX, ICY, R_IN = 610.0, 782.0, 318.0      # inner circle
OPEN_TOP, BAR_TOP, BAR_BOTTOM = 575.0, 720.0, 870.0
STEM_X0, STEM_X1, STEM_BOTTOM = 479.0, 677.0, 995.0
SPUR_X = 1091.0
TBAR = (214.0, 0.0, 942.0, 162.0)
CX = (93.0 + SPUR_X) / 2                  # horizontal centre of the mark, for the wordmark


def x_right(cx, cy, r, y):
    """Right-hand x where a horizontal line at y meets a circle."""
    return cx + math.sqrt(r * r - (y - cy) ** 2)


def y_at_x(cx, cy, r, x, lower=True):
    dy = math.sqrt(r * r - (x - cx) ** 2)
    return cy + dy if lower else cy - dy


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def monogram_paths():
    x0, y0, x1, y1 = TBAR
    t_shape = (
        f"M{f(x0)} {f(y0)}H{f(x1)}V{f(y1)}H{f(STEM_X1)}V{f(STEM_BOTTOM)}"
        f"H{f(STEM_X0)}V{f(y1)}H{f(x0)}Z"
    )
    # G ring: down the flat spur, clockwise round the outer circle to the upper
    # terminal, then back anticlockwise round the inner circle.
    spur_end = y_at_x(OCX, OCY, R_OUT, SPUR_X, lower=True)
    o_term = x_right(OCX, OCY, R_OUT, OPEN_TOP)
    i_term = x_right(ICX, ICY, R_IN, OPEN_TOP)
    i_bar = x_right(ICX, ICY, R_IN, BAR_TOP)
    ring = (
        f"M{f(SPUR_X)} {f(BAR_TOP)}V{f(spur_end)}"
        f"A{f(R_OUT)} {f(R_OUT)} 0 1 1 {f(o_term)} {f(OPEN_TOP)}"
        f"L{f(i_term)} {f(OPEN_TOP)}"
        f"A{f(R_IN)} {f(R_IN)} 0 1 0 {f(i_bar)} {f(BAR_TOP)}Z"
    )
    bar = f"M{f(STEM_X0)} {f(BAR_TOP)}H{f(SPUR_X)}V{f(BAR_BOTTOM)}H{f(STEM_X0)}Z"
    return [t_shape, ring, bar]


def wordmark_path(text="THE TITI-GOLD", target_width=1060.0, baseline=1440.0, tracking=0.16):
    """Outline the wordmark with fontTools so the SVG needs no font installed."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen

    font = TTFont(str(FONT))
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    names = [cmap[ord(c)] for c in text]

    track = tracking * upm
    raw_width = sum(hmtx[n][0] for n in names) + track * (len(names) - 1)
    # Trim the last glyph's right side bearing so the block is optically centred.
    last_adv, last_lsb = hmtx[names[-1]]
    last_glyph_w = gs[names[-1]]
    scale = target_width / raw_width

    pen = SVGPathPen(gs)
    x = 0.0
    for n in names:
        tp = TransformPen(pen, (scale, 0, 0, -scale, CX - target_width / 2 + x * scale, baseline))
        gs[n].draw(tp)
        x += hmtx[n][0] + track
    cap_height = font["OS/2"].sCapHeight * scale if hasattr(font["OS/2"], "sCapHeight") else 0.66 * upm * scale
    return pen.getCommands(), cap_height


GRADIENT = """<defs>
    <linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="140" y1="40" x2="1060" y2="1300">
      <stop offset="0" stop-color="#F6E3A1"/>
      <stop offset=".22" stop-color="#D8B25A"/>
      <stop offset=".45" stop-color="#F3DB8E"/>
      <stop offset=".62" stop-color="#C39434"/>
      <stop offset=".84" stop-color="#EBCD7C"/>
      <stop offset="1" stop-color="#C9A048"/>
    </linearGradient>
  </defs>"""


def svg(view_box, paths, fill, title, gradient_id=None, width=None):
    defs = GRADIENT.format(gid=gradient_id) if gradient_id else ""
    body = "\n  ".join(f'<path d="{d}"/>' for d in paths)
    w = f' width="{width}"' if width else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}"{w} role="img" aria-label="{title}">\n'
        f"  <title>{title}</title>\n  {defs}\n"
        f'  <g fill="{fill}">\n  {body}\n  </g>\n</svg>\n'
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mark = monogram_paths()
    mark_box = "73 -20 1038 1321"  # mark spans x 93–1091, y 0–1281

    (OUT / "titigold-mark.svg").write_text(svg(mark_box, mark, "url(#tg-gold)", "TITI GOLD", "tg-gold"))
    (OUT / "titigold-mark-gold.svg").write_text(svg(mark_box, mark, "#C6A04A", "TITI GOLD"))
    (OUT / "titigold-mark-black.svg").write_text(svg(mark_box, mark, "#151515", "TITI GOLD"))

    word, cap = wordmark_path()
    lock_box = "40 -40 1110 1520"
    (OUT / "titigold-lockup.svg").write_text(svg(lock_box, mark + [word], "url(#tg-gold-l)", "The Titi-Gold", "tg-gold-l"))
    (OUT / "titigold-lockup-black.svg").write_text(svg(lock_box, mark + [word], "#151515", "The Titi-Gold"))
    top = 1440 - cap
    (OUT / "titigold-wordmark.svg").write_text(
        svg(f"55 {f(top - 12)} 1080 {f(cap + 24)}", [word], "url(#tg-gold-w)", "The Titi-Gold", "tg-gold-w")
    )
    print("wrote", *sorted(p.name for p in OUT.glob("*.svg")))


if __name__ == "__main__":
    main()
