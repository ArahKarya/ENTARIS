"""AIRA "Lipat Δ" — sibling of the ENTARIS "Anyaman ∇" mark.

Same grid as docs/brand/entaris (ENTARIS repo):
  * 512 canvas, equilateral triangle side 440, vertical span 65.5 → 446.5
  * bar thickness 88 (perpendicular), gap 7 between overlapping bars
  * flat colour, sharp 60° cuts, bars that tuck under one another
ENTARIS points down (∇, gradient = learning/reasoning);
AIRA points up (Δ, change = the agent acting) and is read as an "A".

Weave: the navy plane (right leg, human approval) lies over the blue plane
(left leg, agent) at the apex; the blue plane lies over the crossbar.
"""
import math
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity

NAVY, BLUE, MID, LIGHT, WHITE = "#1B2B48", "#3D8BE0", "#2E5CA8", "#9CC9F5", "#FFFFFF"

SIDE, T, GAP = 440.0, 88.0, 7.0
TOP, BASE = 65.5, 446.5
CX = 256.0
S3 = math.sqrt(3)


def outer():
    return Polygon([(CX - SIDE / 2, BASE), (CX, TOP), (CX + SIDE / 2, BASE)])


def leg(side):
    """Band of thickness T (perpendicular) along the left (-1) / right (+1) side."""
    apex, foot = (CX, TOP), (CX + side * SIDE / 2, BASE)
    dx, dy = foot[0] - apex[0], foot[1] - apex[1]
    L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    nx, ny = (-uy, ux)                       # a unit normal
    # make the normal point into the triangle (towards the centroid)
    c = (CX, (TOP + 2 * BASE) / 3)
    if (c[0] - apex[0]) * nx + (c[1] - apex[1]) * ny < 0:
        nx, ny = -nx, -ny
    big = 2000
    p1 = (apex[0] - ux * big, apex[1] - uy * big)
    p2 = (apex[0] + ux * big, apex[1] + uy * big)
    band = Polygon([p1, p2, (p2[0] + nx * T, p2[1] + ny * T), (p1[0] + nx * T, p1[1] + ny * T)])
    return band.intersection(outer())


def build_weave(bar_t=58.0, bar_top=312.0):
    """Cyclic weave, like ENTARIS: navy over blue (apex), blue over the
    crossbar (left), crossbar over navy (right). Three bars, three tones."""
    tri = outer()
    L, R = leg(-1), leg(+1)
    bar = box(0, bar_top, 512, bar_top + bar_t).intersection(tri)
    apex_zone = box(0, 0, 512, bar_top - 1)
    blue = L.difference(R.intersection(apex_zone).buffer(GAP, join_style=2))
    third = bar.difference(L.buffer(GAP, join_style=2))          # tucks under blue
    navy = R.difference(third.buffer(GAP, join_style=2))          # crossbar lies over navy
    return {"navy": navy, "blue": blue, "third": third}


def build(bar_t=60.0, bar_top=322.0, three_tone=False):
    tri = outer()
    L, R = leg(-1), leg(+1)
    # crossbar between the legs (full width of the triangle, clipped to it)
    bar = box(0, bar_top, 512, bar_top + bar_t).intersection(tri)

    # navy plane = right leg ∪ crossbar (unless 3-tone: crossbar separate)
    # weave: navy over blue at the apex (blue cut back by GAP around navy there),
    #        blue over the crossbar (crossbar cut back by GAP around blue).
    apex_zone = box(0, 0, 512, bar_top - 1)
    blue = L.difference(R.intersection(apex_zone).buffer(GAP, join_style=2))
    bar_cut = bar.difference(L.buffer(GAP, join_style=2)).difference(R)
    if three_tone:
        bar_piece = bar_cut.difference(R.buffer(GAP, join_style=2))
        navy = R
        return {"navy": navy, "blue": blue, "third": bar_piece}
    navy = unary_union([R, bar_cut])
    return {"navy": navy, "blue": blue}


def to_path(geom, prec=1):
    polys = getattr(geom, "geoms", [geom])
    out = []
    for p in polys:
        if p.is_empty or p.area < 1:
            continue
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append("M" + "L".join(f"{x:.{prec}f} {y:.{prec}f}" for x, y in c) + "Z")
    return "".join(out)


def svg(parts, colors, vb="0 0 512 512", bg=None, rx=0, scale=1.0, title="AIRA"):
    g = []
    if bg:
        g.append(f'<rect width="512" height="512" rx="{rx}" fill="{bg}"/>')
    inner = "".join(f'<path fill="{colors[k]}" d="{to_path(v)}"/>' for k, v in parts.items())
    if scale != 1.0:
        inner = f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">{inner}</g>'
    g.append(inner)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{"".join(g)}</svg>\n')


THEMES = {
    "mark":          dict(navy=NAVY, blue=BLUE, third=MID),
    "mark-negative": dict(navy=WHITE, blue=BLUE, third=LIGHT),
    "mark-mono":     dict(navy="#000000", blue="#000000", third="#000000"),
}
