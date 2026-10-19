"""Build the AIRA "Lipat Δ" kit (sibling of ENTARIS "Anyaman ∇").

Output layout mirrors docs/brand/entaris in the ENTARIS repo.
"""
import os, sys, functools
import cairosvg
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from delta import build_weave, to_path, NAVY, BLUE, MID, LIGHT, WHITE

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/aira/assets/branding/aira-delta"
FONT = "/home/claude/fonts/Archivo.ttf"
MUTED, MUTED_D = "#5B6B85", "#C9D6EA"      # tagline (light / dark bg)
GEOM = build_weave(58.0, 312.0)

COLORWAYS = {
    "default":  dict(navy=NAVY, blue=BLUE, third=MID, word=NAVY, ai=BLUE, tag=MUTED),
    "negative": dict(navy=WHITE, blue=BLUE, third=LIGHT, word=WHITE, ai=LIGHT, tag=MUTED_D),
    "mono":     dict(navy="#000000", blue="#000000", third="#000000", word="#000000", ai="#000000", tag="#000000"),
}
MARK_BOX = (36.0, 65.5, 476.0, 446.5)   # triangle bounds on the 512 grid


def mark_paths(cw, s=1.0, dx=0.0, dy=0.0):
    t = f' transform="translate({dx:.2f} {dy:.2f}) scale({s:.5f})"' if (s != 1 or dx or dy) else ""
    inner = "".join(f'<path fill="{cw[k]}" d="{to_path(GEOM[k])}"/>' for k in ("blue", "third", "navy"))
    return f"<g{t}>{inner}</g>"


def doc(body, w, h, title="AIRA"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" '
            f'aria-label="{title}"><title>{title}</title>{body}</svg>\n')


# --- type ---------------------------------------------------------------------
@functools.lru_cache(None)
def font(wght, wdth):
    return instancer.instantiateVariableFont(TTFont(FONT), {"wght": wght, "wdth": wdth})


def text(t, wght, wdth, size, track, x=0.0, y=0.0):
    f = font(wght, wdth)
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
    sc = size / upm
    paths, bp, cx = [], BoundsPen(gs), 0.0
    for i, ch in enumerate(t):
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tr = (sc, 0, 0, -sc, x + cx, y)
        gs[g].draw(TransformPen(pen, tr)); gs[g].draw(TransformPen(bp, tr))
        paths.append(pen.getCommands())
        cx += gs[g].width * sc + (track * size if i < len(t) - 1 else 0)
    return paths, cx, bp.bounds


def wordmark(cw, x, cap_top, cap_h, tag=True, tag_gap=None):
    """AIRA in Archivo ExtraBold Extended (+4%), 'AI' blue — like ENTARIS 'TA'.
    Tagline Archivo Medium, width 110, +18%."""
    _, _, b = text("A", 800, 125, 100, 0)
    size = cap_h / (-b[1] / 100)
    glyphs, w, _ = text("AIRA", 800, 125, size, 0.04, x=x, y=cap_top + cap_h)
    out = [f'<path fill="{cw["ai"]}" d="{glyphs[0] + glyphs[1]}"/>',
           f'<path fill="{cw["word"]}" d="{glyphs[2] + glyphs[3]}"/>']
    bottom = cap_top + cap_h
    if tag:
        tsize = cap_h * 0.30
        _, _, tb = text("A", 500, 110, tsize, 0)
        th = -tb[1]
        gap = tag_gap if tag_gap is not None else cap_h * 0.34
        tg, tw, _ = text("AI REASONING AGENT", 500, 110, tsize, 0.18, x=x + cap_h * 0.02, y=bottom + gap + th)
        # stretch tracking so the tagline spans the wordmark width exactly
        if tw < w:
            n = len("AI REASONING AGENT") - 1
            extra = (w - cap_h * 0.02 - tw) / n / tsize
            tg, tw, _ = text("AI REASONING AGENT", 500, 110, tsize, 0.18 + extra, x=x + cap_h * 0.02, y=bottom + gap + th)
        out.append(f'<path fill="{cw["tag"]}" d="{"".join(tg)}"/>')
        bottom += gap + th
    return "".join(out), w, bottom


def lockup_h(cw, tag=True):
    H = 100.0
    x0, y0, x1, y1 = MARK_BOX
    s = H / (y1 - y0)
    mark = mark_paths(cw, s, -x0 * s, -y0 * s)
    mw = (x1 - x0) * s
    cap = 0.44 * H
    tagh = (cap * 0.30 * 0.72 + cap * 0.34) if tag else 0
    top = (H - cap - tagh) / 2
    wm, w, _ = wordmark(cw, mw + 0.24 * H, top, cap, tag)
    return doc(mark + wm, mw + 0.24 * H + w, H, "AIRA — AI Reasoning Agent")


def lockup_v(cw):
    W_mark, H_mark = 100.0, 100.0 * (MARK_BOX[3] - MARK_BOX[1]) / (MARK_BOX[2] - MARK_BOX[0])
    cap = 30.0
    _, wwid, _ = text("AIRA", 800, 125, 100, 0.04)
    _, _, b = text("A", 800, 125, 100, 0)
    ww = wwid * cap / (-b[1])
    W = max(W_mark, ww)
    x0, y0, x1, y1 = MARK_BOX
    s = W_mark / (x1 - x0)
    mark = mark_paths(cw, s, (W - W_mark) / 2 - x0 * s, -y0 * s)
    wm, w, bottom = wordmark(cw, (W - ww) / 2, H_mark + 22, cap)
    return doc(mark + wm, W, bottom + 1, "AIRA — AI Reasoning Agent")


def mark_svg(cw):
    return doc(mark_paths(cw), 512, 512)


def icon(bg, cw, rx=112, scale=0.76):
    tile = f'<rect width="512" height="512" rx="{rx}" fill="{bg}"/>'
    g = f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">{mark_paths(cw)}</g>'
    return doc(tile + g, 512, 512)


def png(s, path, w, h=None):
    cairosvg.svg2png(bytestring=s.encode(), write_to=path, output_width=w, **({"output_height": h} if h else {}))


if __name__ == "__main__":
    svgd, pngd, webd = (os.path.join(OUT, d) for d in ("svg", "png", "web"))
    for d in (svgd, pngd, webd):
        os.makedirs(d, exist_ok=True)
    D, N, M = COLORWAYS["default"], COLORWAYS["negative"], COLORWAYS["mono"]
    files = {
        "aira-mark.svg": mark_svg(D),
        "aira-mark-negative.svg": mark_svg(N),
        "aira-mark-mono.svg": mark_svg(M),
        "aira-icon.svg": icon(NAVY, N),
        "aira-icon-light.svg": icon(WHITE, D),
        "aira-icon-maskable.svg": icon(NAVY, N, rx=0, scale=0.66),
        "aira-lockup.svg": lockup_h(D),
        "aira-lockup-negative.svg": lockup_h(N),
        "aira-lockup-mono.svg": lockup_h(M),
        "aira-lockup-compact.svg": lockup_h(D, tag=False),
        "aira-lockup-compact-negative.svg": lockup_h(N, tag=False),
        "aira-lockup-stacked.svg": lockup_v(D),
        "aira-lockup-stacked-negative.svg": lockup_v(N),
    }
    for name, s in files.items():
        open(os.path.join(svgd, name), "w").write(s)
        png(s, os.path.join(pngd, name[:-4] + ".png"), 1600 if "lockup" in name else 1024)

    # web / PWA (same set as ENTARIS client/public)
    png(files["aira-icon.svg"], os.path.join(webd, "pwa-192x192.png"), 192, 192)
    png(files["aira-icon.svg"], os.path.join(webd, "pwa-512x512.png"), 512, 512)
    png(files["aira-icon-maskable.svg"], os.path.join(webd, "pwa-maskable-512x512.png"), 512, 512)
    png(files["aira-icon-maskable.svg"], os.path.join(webd, "apple-touch-icon.png"), 180, 180)
    ims = {}
    for px in (16, 32, 48):
        p = os.path.join(webd, f"favicon-{px}.png")
        png(files["aira-icon.svg"], p, px, px)
        ims[px] = Image.open(p).convert("RGBA")
    ims[48].save(os.path.join(webd, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ims[16], ims[32]])
    open(os.path.join(webd, "favicon.svg"), "w").write(files["aira-icon.svg"])

    # drop-in replacements for ENTARIS client/public (AiraIcon.tsx: symbol only, transparent)
    ent = os.path.join(OUT, "entaris-client-public")
    os.makedirs(ent, exist_ok=True)
    png(mark_svg(D), os.path.join(ent, "aira-icon.png"), 167, 167)            # light theme
    png(mark_svg(N), os.path.join(ent, "aira-icon-light.png"), 167, 167)      # dark theme
    png(lockup_v(D), os.path.join(ent, "aira-logo-light.png"), 410)
    png(lockup_v(N), os.path.join(ent, "aira-logo-dark.png"), 410)
    print("built", OUT)
