#!/usr/bin/env python3
"""
Wandr logo — fully custom calligraphic wordmark.
Every letterform is hand-crafted as cubic bezier paths.
Calligraphic rendering: thick downstrokes, thin upstrokes.
"""
import math
from PIL import Image, ImageDraw

SCALE = 4
W, H   = 1600, 600
WS, HS = W * SCALE, H * SCALE

BG       = (13,  13,  13)
ORANGE   = (201, 100, 66)
ORANGE_M = (170,  82, 50)
ORANGE_D = (130,  60, 36)
WHITE    = (255, 255, 255)

# ── Bezier helpers ────────────────────────────────────────────────────────────

def cubic_pt(t, p0, cp1, cp2, p1):
    mt = 1 - t
    return (
        mt**3*p0[0] + 3*mt**2*t*cp1[0] + 3*mt*t**2*cp2[0] + t**3*p1[0],
        mt**3*p0[1] + 3*mt**2*t*cp1[1] + 3*mt*t**2*cp2[1] + t**3*p1[1],
    )

def cubic_tangent(t, p0, cp1, cp2, p1):
    mt = 1 - t
    dx = 3*(mt**2*(cp1[0]-p0[0]) + 2*mt*t*(cp2[0]-cp1[0]) + t**2*(p1[0]-cp2[0]))
    dy = 3*(mt**2*(cp1[1]-p0[1]) + 2*mt*t*(cp2[1]-cp1[1]) + t**2*(p1[1]-cp2[1]))
    return dx, dy

def callig_width(dx, dy, max_w, min_w):
    """Copperplate: heavy on downstrokes, hairline on upstrokes."""
    l = math.hypot(dx, dy) or 1
    ndy = dy / l
    t = (ndy + 1) / 2
    return min_w + (max_w - min_w) * (t ** 1.3)

def draw_stroke(draw, segs, color, max_w=22, min_w=2.2, samples=120):
    mw   = max_w * SCALE
    mnw  = min_w * SCALE
    col4 = (*color, 255)

    for seg in segs:
        p0, cp1, cp2, p1 = (
            (seg[0][0]*SCALE, seg[0][1]*SCALE),
            (seg[1][0]*SCALE, seg[1][1]*SCALE),
            (seg[2][0]*SCALE, seg[2][1]*SCALE),
            (seg[3][0]*SCALE, seg[3][1]*SCALE),
        )
        prev_pt   = None
        prev_hw   = None
        prev_perp = (0, 1)

        for i in range(samples + 1):
            t  = i / samples
            pt = cubic_pt(t, p0, cp1, cp2, p1)
            dx, dy = cubic_tangent(t, p0, cp1, cp2, p1)
            hw = callig_width(dx, dy, mw, mnw) / 2
            l  = math.hypot(dx, dy) or 1
            perp = (-dy/l, dx/l)

            r  = int(hw)
            ix, iy = int(pt[0]), int(pt[1])
            draw.ellipse([ix-r, iy-r, ix+r, iy+r], fill=col4)

            if prev_pt is not None:
                ph = prev_hw or hw
                pp = prev_perp
                quad = [
                    (int(prev_pt[0] - ph*pp[0]), int(prev_pt[1] - ph*pp[1])),
                    (int(prev_pt[0] + ph*pp[0]), int(prev_pt[1] + ph*pp[1])),
                    (int(pt[0]      + hw*perp[0]), int(pt[1]      + hw*perp[1])),
                    (int(pt[0]      - hw*perp[0]), int(pt[1]      - hw*perp[1])),
                ]
                draw.polygon(quad, fill=col4)

            prev_pt   = pt
            prev_hw   = hw
            prev_perp = perp


# ── Letter definitions ────────────────────────────────────────────────────────
#
#   Connected path: w → a → n → d → r
#   Baseline y=326  |  x-height y=208  |  ascender y=88
#   Exit of each letter = entry of next (verified below)
#
# ─────────────────────────────────────────────────────────────────────────────

# ── w ──  exit: (660, 240)
W_SEGS = [
    ((490, 326), (494, 276), (514, 208), (526, 208)),   # entry rise
    ((526, 208), (539, 208), (551, 326), (560, 326)),   # hump 1 down
    ((560, 326), (565, 326), (579, 208), (591, 208)),   # rise 2
    ((591, 208), (604, 208), (616, 326), (625, 326)),   # hump 2 down
    ((625, 326), (630, 326), (648, 240), (660, 240)),   # exit rise
]

# ── a ──  entry: (660, 240)  exit: (774, 252)
A_SEGS = [
    ((660, 240), (664, 224), (680, 194), (696, 192)),   # entry → bowl top
    ((696, 192), (720, 184), (742, 212), (738, 256)),   # bowl top → right
    ((738, 256), (742, 302), (718, 328), (696, 326)),   # bowl right → bottom
    ((696, 326), (670, 328), (654, 304), (658, 262)),   # bottom → left
    ((658, 262), (653, 230), (674, 200), (695, 204)),   # left → close (thin up)
    ((695, 204), (706, 196), (730, 198), (736, 206)),   # hairline cross → stem
    ((736, 206), (740, 252), (740, 304), (736, 326)),   # stem — heavy downstroke
    ((736, 326), (739, 334), (760, 252), (774, 252)),   # exit rise
]

# ── n ──  entry: (774, 252)  exit: (950, 252)
N_SEGS = [
    ((774, 252), (778, 237), (791, 208), (802, 208)),   # entry rise
    ((802, 208), (827, 198), (845, 326), (849, 326)),   # arch 1 down
    ((849, 326), (854, 326), (871, 208), (882, 208)),   # inter-arch rise
    ((882, 208), (907, 198), (925, 326), (929, 326)),   # arch 2 down
    ((929, 326), (933, 326), (943, 252), (950, 252)),   # exit rise
]

# ── d ──  entry: (950, 252)  exit: (1070, 252)
#   Bowl identical in shape to 'a' but offset right.
#   Ascender: thin up-stroke → broad loop sweeps right → thick down-stroke.
D_SEGS = [
    ((950, 252), (954, 237), (968, 192), (982, 190)),    # entry → bowl top
    ((982, 190), (1006, 182), (1028, 210), (1024, 254)), # bowl top → right
    ((1024, 254), (1028, 300), (1004, 326), (982, 324)), # bowl right → bottom
    ((982, 324), (956, 326), (940, 302), (944, 260)),    # bottom → left
    ((944, 260), (939, 228), (960, 198), (980, 204)),    # left → close (thin up)
    ((980, 204), (992, 196), (1020, 200), (1024, 208)),  # hairline cross → ascender base
    ((1024, 208), (1023, 150), (1022,  96), (1020,  86)), # thin upstroke (ascender)
    ((1020,  86), (1018,  76), (1060,  78), (1065,  96)), # loop sweeps broadly right
    ((1065,  96), (1070, 115), (1066, 165), (1062, 210)), # thick downstroke back down
    ((1062, 210), (1064, 260), (1062, 308), (1060, 326)), # heavy stem to baseline
    ((1060, 326), (1062, 334), (1070, 252), (1070, 252)), # exit
]

# ── r ──  entry: (1070, 252)
#   Rises, makes a shoulder that curves RIGHT then back LEFT — reads as 'r' not 'n'.
#   Descent comes from where shoulder returns, not from far right.
R_SEGS = [
    ((1070, 252), (1073, 236), (1082, 208), (1092, 208)), # entry rise
    ((1092, 208), (1110, 200), (1124, 207), (1124, 224)), # shoulder goes right
    ((1124, 224), (1124, 240), (1110, 254), (1096, 258)), # shoulder curves BACK LEFT
    ((1096, 258), (1090, 260), (1082, 298), (1080, 326)), # descent (left of shoulder)
    ((1080, 326), (1078, 335), (1116, 302), (1148, 288)), # exit flourish
]

ALL_SEGS = W_SEGS + A_SEGS + N_SEGS + D_SEGS + R_SEGS


# ── Main ─────────────────────────────────────────────────────────────────────

def make():
    img  = Image.new("RGBA", (WS, HS), (*BG, 255))
    draw = ImageDraw.Draw(img)

    # ── Paper plane ──────────────────────────────────────────────────────────
    PCX = int(300 * SCALE)
    PCY = int(300 * SCALE)
    S   = int(108 * SCALE)

    A  = math.radians(-22)
    ca, sa = math.cos(A), math.sin(A)

    def pp(x, y):
        return (PCX + int((x*ca - y*sa)*S), PCY + int((x*sa + y*ca)*S))

    nose      = pp( 0.80,  0.00)
    top_tip   = pp(-0.58, -0.52)
    top_inner = pp(-0.08, -0.10)
    back      = pp(-0.22,  0.00)
    bot_inner = pp(-0.08,  0.10)
    bot_tip   = pp(-0.58,  0.52)

    draw.polygon([nose, bot_inner, bot_tip],  fill=(*ORANGE_D, 255))
    draw.polygon([nose, top_tip, top_inner],  fill=(*ORANGE_M, 255))
    draw.polygon([nose, top_inner, back, bot_inner], fill=(*ORANGE, 255))

    lw = max(3, int(1.8 * SCALE))
    draw.line([nose, back],      fill=(*BG, 220), width=lw)
    draw.line([nose, top_inner], fill=(*BG, 80),  width=max(2, int(SCALE)))
    draw.line([nose, bot_inner], fill=(*BG, 80),  width=max(2, int(SCALE)))

    # ── Motion trail ─────────────────────────────────────────────────────────
    te_x = PCX + int((-0.30*ca)*S)
    te_y = PCY + int((-0.30*sa)*S)
    trail_end   = (te_x, te_y)
    trail_start = (int(88*SCALE), int(392*SCALE))
    ctrl        = (int(188*SCALE), int(312*SCALE))

    def qb(t, p0, p1, p2):
        mt = 1-t
        return (mt*mt*p0[0]+2*mt*t*p1[0]+t*t*p2[0],
                mt*mt*p0[1]+2*mt*t*p1[1]+t*t*p2[1])

    N = 300; dash_on = 14*SCALE; dash_off = 10*SCALE
    acc = 0.0; on = True; prev = qb(0, trail_start, ctrl, trail_end)
    tlw = max(2, int(1.5*SCALE))
    for i in range(1, N+1):
        cur = qb(i/N, trail_start, ctrl, trail_end)
        seg = math.hypot(cur[0]-prev[0], cur[1]-prev[1])
        alpha = int(48 + 138*(i/N))
        if on:
            draw.line([int(prev[0]),int(prev[1]),int(cur[0]),int(cur[1])],
                      fill=(*ORANGE, alpha), width=tlw)
        acc += seg
        if on  and acc >= dash_on:  on=False; acc-=dash_on
        elif not on and acc >= dash_off: on=True; acc-=dash_off
        prev = cur
    dot_r = int(4*SCALE)
    ts = trail_start
    draw.ellipse([ts[0]-dot_r,ts[1]-dot_r,ts[0]+dot_r,ts[1]+dot_r], fill=(*ORANGE,65))

    # ── Separator ────────────────────────────────────────────────────────────
    sx = int(448*SCALE)
    draw.line([(sx, int(178*SCALE)), (sx, int(412*SCALE))],
              fill=(*ORANGE, 85), width=max(1, int(0.75*SCALE)))

    # ── Calligraphic wordmark ─────────────────────────────────────────────────
    draw_stroke(draw, ALL_SEGS, WHITE, max_w=15, min_w=2.2, samples=140)

    # ── Finalise ─────────────────────────────────────────────────────────────
    out = img.resize((W, H), Image.LANCZOS).convert("RGB")
    path = ("/Users/kraig/Documents/Claude/Projects/The Kraig"
            "/Claude Combinator/wandr/wandr_logo.png")
    out.save(path, "PNG", quality=95)
    print(f"Saved → {path}")


if __name__ == "__main__":
    make()
