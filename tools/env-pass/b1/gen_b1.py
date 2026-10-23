"""B1 designer step: density maps and sampled placements for tile B1 (Brightwater lane and Kettlewick).
Run: python3 tools/env-pass/b1/gen_b1.py <outDir>
Reads src/region/ANCHORS.md (structures, triggers, anchors) so the keep-out zones are the game's own; writes
  density-<layer>.png, density-all.png, plan-placements.png, b1.placements.json, b1.counts.json.
Coordinates: metres, +Z north (up in the images). Tile B1 core x -100..160, z -30..230; overlap band 52 m blend-only.
"""
import json, math, re, sys, random
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
X0, X1, Z0, Z1, PX = -150, 210, -80, 280, 3  # image window includes the overlap band; 3 px per metre
W, H = (X1 - X0) * PX, (Z1 - Z0) * PX
rng = random.Random(1307)
nrng = np.random.default_rng(1307)

# ---- game data -------------------------------------------------------------
md = open('src/region/ANCHORS.md').read()
def rows(section):
    body = md.split('## ' + section)[1].split('\n## ')[0]
    return [[c.strip() for c in l.strip('|').split('|')] for l in body.splitlines() if l.startswith('| ') and not l.startswith('| id') and '---' not in l]
structs = []
for r in rows('Structures'):
    sid, kind, x, z, fp = r[0], r[1], float(r[2]), float(r[3]), r[4]
    w, d = [float(v) for v in fp.split('x')]
    if X0 - 20 < x < X1 + 20 and Z0 - 20 < z < Z1 + 20: structs.append((sid, kind, x, z, w, d))
trigs = []
for r in rows('Triggers'):
    tid, shape, x, z, size = r[0], r[1], float(r[2]), float(r[3]), r[4]
    if shape == 'sphere': trigs.append((tid, x, z, float(size.split()[1]), float(size.split()[1])))
    else:
        m = re.findall(r'[0-9.]+', size); trigs.append((tid, x, z, float(m[0]), float(m[2])))
anchors = []
for r in rows('Anchors'):
    anchors.append((r[0], float(r[1]), float(r[2]), r[5] if len(r) > 5 else ''))
HOUSE_KINDS = {'house', 'tavern', 'bakery', 'chapel', 'mill', 'loft', 'granary'}

# ---- grid helpers ----------------------------------------------------------
gx = np.arange(X0, X1, 1.0) + 0.5
gz = np.arange(Z0, Z1, 1.0) + 0.5
GX, GZ = np.meshgrid(gx, gz)  # shape (nz, nx)

def vnoise(scale, seed):
    r = np.random.default_rng(seed)
    nx, nz = int((X1 - X0) / scale) + 3, int((Z1 - Z0) / scale) + 3
    g = r.random((nz, nx))
    fx, fz = (GX - X0) / scale, (GZ - Z0) / scale
    ix, iz = fx.astype(int), fz.astype(int)
    tx, tz = fx - ix, fz - iz
    tx, tz = tx * tx * (3 - 2 * tx), tz * tz * (3 - 2 * tz)
    a, b = g[iz, ix], g[iz, ix + 1]; c, d = g[iz + 1, ix], g[iz + 1, ix + 1]
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz

N_LARGE, N_MID, N_SMALL = vnoise(70, 1), vnoise(26, 2), vnoise(9, 3)

def rect_mask(cx, cz, w, d, margin):
    return (np.abs(GX - cx) <= w / 2 + margin) & (np.abs(GZ - cz) <= d / 2 + margin)

# keep-out layers: 'solid' = nothing may stand (structures, lane, yard, triggers for tall things); 'open' = tall things only
solid = np.zeros_like(GX, bool); tall_free = np.zeros_like(GX, bool)
for sid, kind, x, z, w, d in structs:
    if kind in ('waystone', 'altar', 'stair', 'pole', 'board'): solid |= rect_mask(x, z, w, d, 1.5); continue
    if kind == 'yard-fence': tall_free |= rect_mask(x, z, w, d, 1.0); continue
    if kind in ('fence', 'gate', 'cart'): solid |= rect_mask(x, z, w, d, 1.2); continue
    if kind == 'rock': solid |= rect_mask(x, z, w, d, 1.0); continue
    solid |= rect_mask(x, z, max(w, 5.5), max(d, 5.5), 1.8)  # real models are 4.4 x 4.7 m; keep layout footprint clear
for tid, x, z, a, b in trigs:
    if abs(a - b) < 1e-6 and 'trg.region' not in tid: tall_free |= ((GX - x) ** 2 + (GZ - z) ** 2) <= (a + 1.5) ** 2
    elif 'region' not in tid and 'wardstones' not in tid: tall_free |= rect_mask(x, z, 2 * a, 2 * b, 1.0)
for aid, x, z, tags in anchors:
    solid |= ((GX - x) ** 2 + (GZ - z) ** 2) <= 1.2 ** 2
# the lane and the road: x within 3.5 of 0 from z -2 to 170 (bare track, wider where it meets the gates and square)
lane = (np.abs(GX) <= 3.6) & (GZ >= -2) & (GZ <= 170)
chapel_path = (np.abs(GZ - 60) <= 2.2) & (GX >= 0) & (GX <= 46)
obst = solid.copy()  # structures, fences, anchors only (no lane): the verge strip may sit up to these
LANE_PAD = 4.1  # lane surface half width 3.6 plus 0.5 m: no grass or flowers inside it
solid |= lane | chapel_path
square = (np.abs(GX - 3) <= 30) & (GZ >= 108) & (GZ <= 168)  # Kettlewick green: kept open
barley = ((np.abs(GX) >= 5) & (np.abs(GX) <= 30) & (GZ >= 2) & (GZ <= 24))  # existing barley slabs (approx; read barley.ts at build time)
bare = solid | barley

dist_lane = np.abs(GX)
near_house = np.zeros_like(GX)
for sid, kind, x, z, w, d in structs:
    if kind in HOUSE_KINDS: near_house = np.maximum(near_house, np.clip(1 - np.hypot(GX - x, GZ - z) / 14, 0, 1))

# tile taper: core x -100..160, z -30..230; overlap 52 m blend-only (global function so neighbours reproduce it exactly)
def taper(v, lo, hi, band=52.0):
    return np.clip(np.minimum(v - (lo - band), (hi + band) - v) / band, 0, 1)
in_tile = taper(GX, -100, 160) * taper(GZ, -30, 230)

# ---- layers (expected items per 100 m2) ------------------------------------
verge = (dist_lane > 3.6) & (dist_lane < 13) & (GZ > 28) & (GZ < 108)
open_green = square.astype(float)
L = {}
L['trees'] = (0.010 + 0.12 * np.clip(N_LARGE - 0.45, 0, 1) * 1.9 + 0.05 * (verge & (N_MID > 0.55))) * (1 - 0.9 * open_green)
L['trees'][tall_free | bare] = 0
L['bushes'] = (0.04 + 0.25 * near_house + 0.12 * np.clip(N_MID - 0.4, 0, 1) + 0.12 * verge) * (1 - 0.6 * open_green); L['bushes'][bare | tall_free] = 0
L['grass'] = (0.16 + 1.9 * np.clip(N_MID - 0.4, 0, 1) + 0.6 * verge + 0.15 * np.clip(N_SMALL - 0.6, 0, 1)); L['grass'][bare] = 0
L['grass'][solid] = 0
L['flowers'] = (0.01 + 0.6 * np.clip(N_SMALL * N_MID - 0.3, 0, 1) + 0.2 * verge * N_SMALL); L['flowers'][bare] = 0
L['rocks'] = (0.004 + 0.02 * np.clip(N_LARGE - 0.6, 0, 1)); L['rocks'][bare | tall_free] = 0
L['wood'] = (0.003 + 0.01 * np.clip(N_LARGE - 0.55, 0, 1) * (N_SMALL > 0.4)); L['wood'][bare | tall_free] = 0  # stumps, logs, mushrooms, ferns
L['wood'] *= 1
for k in L: L[k] = L[k] * in_tile

# ---- images ----------------------------------------------------------------
def to_img(arr, hi, tint):
    a = np.clip(arr / hi, 0, 1)
    rgb = np.zeros(arr.shape + (3,), float)
    base = np.array([42, 48, 54])
    for c in range(3): rgb[..., c] = base[c] + (np.array(tint[c]) - base[c]) * a
    img = Image.fromarray(np.flipud(rgb).astype(np.uint8)).resize((W, H), Image.NEAREST)
    return img

def overlay(img, labels=True):
    dr = ImageDraw.Draw(img, 'RGBA')
    px = lambda x, z: ((x - X0) * PX, (Z1 - z) * PX)
    for sid, kind, x, z, w, d in structs:
        a, b = px(x - w / 2, z + d / 2), px(x + w / 2, z - d / 2)
        col = (230, 90, 70, 200) if kind in HOUSE_KINDS else (240, 210, 90, 200) if kind in ('fence', 'yard-fence', 'cart', 'gate') else (180, 180, 190, 200)
        dr.rectangle([a, b], outline=col, width=1)
    for tid, x, z, a, b in trigs:
        if 'region' in tid or 'wardstones' in tid: continue
        c = px(x, z)
        if abs(a - b) < 1e-6: dr.ellipse([c[0] - a * PX, c[1] - a * PX, c[0] + a * PX, c[1] + a * PX], outline=(90, 200, 255, 140))
        else: dr.rectangle([c[0] - a * PX, c[1] - b * PX, c[0] + a * PX, c[1] + b * PX], outline=(90, 200, 255, 140))
    # lane
    dr.rectangle([px(-3.6, 170), px(3.6, -2)], outline=(200, 160, 100, 220))
    # tile core and overlap band
    dr.rectangle([px(-100, 230), px(160, -30)], outline=(255, 255, 255, 230), width=2)
    dr.rectangle([px(-152, 282), px(212, -82)], outline=(255, 255, 255, 80))
    dr.rectangle([px(-100 - 52, 230 + 52), px(160 + 52, -30 - 52)], outline=(255, 255, 255, 110))
    return img

specs = {'trees': (0.18, (80, 200, 90)), 'bushes': (0.4, (150, 220, 80)), 'grass': (4.5, (190, 230, 90)),
         'flowers': (1.3, (240, 120, 200)), 'rocks': (0.14, (200, 200, 210)), 'wood': (0.08, (210, 150, 90))}
for k, (hi, tint) in specs.items():
    overlay(to_img(L[k], hi, tint)).save(f'{OUT}/density-{k}.png')
# combined: trees green, bushes yellow-green, flowers magenta, rocks grey on dark
comb = np.zeros(GX.shape + (3,), float) + np.array([42, 48, 54])
for k, col in [('grass', (60, 90, 55)), ('flowers', (220, 90, 190)), ('bushes', (160, 220, 70)), ('rocks', (190, 190, 200)), ('wood', (200, 140, 80)), ('trees', (40, 220, 80))]:
    a = np.clip(L[k] / specs[k][0], 0, 1)[..., None]
    comb = comb * (1 - a * 0.85) + np.array(col) * a * 0.85
overlay(Image.fromarray(np.flipud(comb).astype(np.uint8)).resize((W, H), Image.NEAREST)).save(f'{OUT}/density-all.png')

# ---- sample placements -----------------------------------------------------
def sample(layer, count_per100, min_d, ids, size_jit=0.12, extra_ok=None, existing=None):
    out, total = [], float(L[layer].sum()) * 0 + float(count_per100)
    dens = L[layer]
    cells = np.argwhere(dens > 0)
    p = dens[dens > 0]; p = p / p.sum()
    target = int(dens.sum() / 100 * 1.0 * count_per100)
    tries = 0
    pts = existing if existing is not None else []
    while len(out) < target and tries < target * 40:
        tries += 1
        i = nrng.choice(len(p), p=p); iz, ix = cells[i]
        x, z = X0 + ix + rng.random(), Z0 + iz + rng.random()
        if any((x - qx) ** 2 + (z - qz) ** 2 < min_d ** 2 for qx, qz in pts): continue
        pts.append((x, z))
        out.append({'id': rng.choice(ids), 'x': round(x, 2), 'z': round(z, 2), 'yaw': round(rng.uniform(0, 360), 1), 'scale': round(1 + rng.uniform(-size_jit, size_jit), 3)})
    return out

TREE_IDS = ['oak-a', 'oak-b', 'oak-c', 'birch-a', 'birch-b', 'elm-or-ash-a', 'autumn-tree-a']
TALL = set(TREE_IDS)
GROUND_IDS = ('grass', 'flower')
FIRE = [(0, 70), (-10.8, 80), (9.2, 76)]  # lane.fire-cart, fire-house-08, fire-house-09: props 3 m clear

def lane_pt(x, z):
    return abs(x) <= LANE_PAD and -2 <= z <= 170

def chapel_pt(x, z):
    return abs(z - 60) <= 2.7 and 0 <= x <= 46.5

def cell(x, z):
    ix, iz = int(x - X0), int(z - Z0)
    if not (0 <= ix < GX.shape[1] and 0 <= iz < GX.shape[0]): return None
    return iz, ix

def rr(a, b):
    return rng.uniform(a, b)

def row(i, x, z, scale, yaw=None, **kw):
    d = {'id': i, 'x': round(x, 2), 'z': round(z, 2), 'yaw': round(rr(0, 360) if yaw is None else yaw, 1), 'scale': round(scale, 3)}
    d.update(kw)
    return d

placed = []
P = []
# scattered single trees: thin (the copses carry the woods); scale 0.8..1.3 and a mix that includes birch and elm
trees = sample('trees', 0.45, 8.0, TREE_IDS + ['birch-a', 'birch-b', 'elm-or-ash-a', 'elm-or-ash-a'], 0.0, existing=placed)
for t in trees: t['scale'] = round(rr(0.8, 1.3), 3)
P += trees
# copses: 9 clusters of 4 to 7 trees, every one with at least a birch and an elm, a random scale 0.8..1.3 and yaw
cells = np.argwhere((N_LARGE > 0.58) & ~bare & ~tall_free & (np.abs(GX) > 16) & (in_tile > 0.99))
cells = list(map(tuple, cells)); rng.shuffle(cells)
centres = []
for iz, ix in cells:
    cx, cz = X0 + ix + 0.5, Z0 + iz + 0.5
    if all((cx - a) ** 2 + (cz - b) ** 2 > 38 ** 2 for a, b in centres): centres.append((cx, cz))
    if len(centres) >= 9: break
for cx, cz in centres:
    kinds = ['birch-a' if rng.random() < 0.5 else 'birch-b', 'elm-or-ash-a'] + [rng.choice(['oak-a', 'oak-b', 'oak-c', 'autumn-tree-a', 'birch-a', 'elm-or-ash-a']) for _ in range(rng.randint(2, 5))]
    for kid in kinds:
        for _try in range(40):
            a, r = rr(0, 6.283), rr(1, 10)
            x, z = cx + r * math.cos(a), cz + r * math.sin(a)
            c = cell(x, z)
            if c is None or bare[c] or tall_free[c]: continue
            if any((x - qx) ** 2 + (z - qz) ** 2 < 4.5 ** 2 for qx, qz in placed): continue
            placed.append((x, z)); P.append(row(kid, x, z, rr(0.8, 1.3))); break
    # litter round the copse, spread so nothing reads as one pasted clump: a stump or log, a fern pair, mushrooms apart, one rock
    for kid, rmin, rmax, sc in [(rng.choice(['stump-a', 'stump-b', 'log-fallen-a']), 5, 9, (1.0, 1.3)), ('fern-a', 4, 8, (1.1, 1.5)), ('fern-a', 6, 11, (1.1, 1.5)), ('mushrooms-a', 7, 12, (1.4, 1.9)), (rng.choice(['rock-cluster-a', 'boulder-large-b']), 8, 13, (0.9, 1.2))][:4 if rng.random() < 0.5 else 5]:
        for _try in range(40):
            a, r = rr(0, 6.283), rr(rmin, rmax)
            x, z = cx + r * math.cos(a), cz + r * math.sin(a)
            c = cell(x, z)
            if c is None or bare[c] or tall_free[c]: continue
            if any((x - qx) ** 2 + (z - qz) ** 2 < 3.2 ** 2 for qx, qz in placed): continue
            placed.append((x, z)); P.append(row(kid, x, z, rr(*sc))); break
# the eastern rise (chapel side): boulders and rock clusters grouped loosely, ferns between; nothing under 0.9 x native
RISE = (88.0, 78.0)
for k in range(6):
    for _try in range(60):
        a, r = rr(0, 6.283), rr(2, 15)
        x, z = RISE[0] + r * math.cos(a) * 1.3, RISE[1] + r * math.sin(a)
        c = cell(x, z)
        if c is None or bare[c] or tall_free[c]: continue
        if any((x - qx) ** 2 + (z - qz) ** 2 < 4.0 ** 2 for qx, qz in placed): continue
        placed.append((x, z)); P.append(row(['boulder-large-a', 'boulder-large-b', 'rock-cluster-a', 'rock-cluster-a'][k % 4], x, z, rr(0.9, 1.25))); break
for k in range(4):
    for _try in range(60):
        a, r = rr(0, 6.283), rr(3, 16)
        x, z = RISE[0] + r * math.cos(a) * 1.3, RISE[1] + r * math.sin(a)
        c = cell(x, z)
        if c is None or bare[c] or tall_free[c]: continue
        if any((x - qx) ** 2 + (z - qz) ** 2 < 2.5 ** 2 for qx, qz in placed): continue
        placed.append((x, z)); P.append(row('fern-a', x, z, rr(1.1, 1.5))); break
bushes = sample('bushes', 1.0, 2.2, ['bush-round-a', 'bush-round-b', 'bush-flowering-a', 'bush-flowering-b'], existing=placed); P += bushes
# the density-driven rock and wood layers are now very sparse (a few strays, 6 m apart); rocks keep scale >= 0.9
rocks = sample('rocks', 0.5, 9.0, ['rock-cluster-a', 'boulder-large-a', 'boulder-large-b'], 0.0, existing=placed)
for r_ in rocks: r_['scale'] = round(rr(0.9, 1.25), 3)
P += rocks
wood = sample('wood', 1.0, 6.0, ['stump-a', 'stump-b', 'log-fallen-a', 'fern-a'], 0.0, existing=placed)
for w_ in wood: w_['scale'] = round(rr(1.0, 1.4), 3)
P += wood
flowers = sample('flowers', 1.0, 1.4, ['flower-patch-yellow', 'flower-patch-white', 'flower-patch-purple', 'flower-patch-red'], 0.2, existing=[]); P += flowers
grass = sample('grass', 1.0, 0.9, ['grass-clump-a', 'grass-clump-b', 'grass-clump-c'], 0.25, existing=[]); P += grass

# hedges: modules of 3.4 m along both verges of the lane z 32..105, gapped at cart (61..79), lane fence (87..93) and house paths
HEDGE_X = 6.2
for sgn in (-1, 1):
    z = 32.0
    while z + 3.4 <= 105:
        zc = z + 1.7
        gap = (61 < zc < 79) or (87 < zc < 93)
        for sid, kind, x, zz, w, d in structs:
            if kind in ('house', 'tavern', 'bakery') and (sgn * x > 0) and abs(zc - zz) < 3.4 and abs(x) < 34: gap = True
        if not gap: P.append({'id': 'hedge-straight', 'x': sgn * HEDGE_X, 'z': round(zc, 2), 'yaw': 90.0, 'scale': 1.0})
        z += 3.4
# lanterns along the verge every 18 m, alternating sides (taste call, logged by the builder)
LANTERNS = []
for z in range(40, 112, 18):
    LANTERNS.append((-5.0 if (z // 18) % 2 else 5.0, z))
    P.append({'id': 'post_lantern', 'x': LANTERNS[-1][0], 'z': z, 'yaw': 0, 'scale': 1.0})
# landmark oaks (the sheet): two large trees at the lane edge
P.append({'id': 'oak-a', 'x': -24, 'z': 34, 'yaw': 30, 'scale': 1.25, 'landmark': True})
P.append({'id': 'oak-c', 'x': 24, 'z': 62, 'yaw': 200, 'scale': 1.3, 'landmark': True})

# ---- (1) verge strip at the hedge foot: long grass, ferns and flower patches on both sides of the lane -------------
def free_pt(x, z, pad=0.0):
    c = cell(x, z)
    if c is None or obst[c]: return False
    if lane_pt(x, z) or chapel_pt(x, z): return False
    if any((x - lx) ** 2 + (z - lz) ** 2 < (0.9 + pad) ** 2 for lx, lz in LANTERNS): return False
    if any((x - fx) ** 2 + (z - fz) ** 2 < 3.0 ** 2 for fx, fz in FIRE): return False
    return True

FLOWER_IDS = ['flower-patch-yellow', 'flower-patch-white', 'flower-patch-purple', 'flower-patch-red']
GRASS_IDS = ['grass-clump-a', 'grass-clump-b', 'grass-clump-c']
strip = []
for sgn in (-1, 1):
    # lane side, between the lane surface (+0.5 m) and the hedge: x 4.45..5.55 (to 6.4 where there is no hedge), z 27..168
    z = 27.0
    while z < 168:
        z += rr(0.7, 1.3)
        x = sgn * rr(4.45, 5.55 if 32 <= z <= 105 else 6.4)
        if free_pt(x, z): strip.append(row(rng.choice(GRASS_IDS), x, z, rr(0.9, 1.35)))
    # outer side of the hedge: x 6.7..8.2, z 32..105
    z = 31.0
    while z < 106:
        z += rr(0.9, 1.6)
        x = sgn * rr(6.7, 8.2)
        if free_pt(x, z): strip.append(row(rng.choice(GRASS_IDS), x, z, rr(0.9, 1.4)))
    # ferns every 5..8 m at the hedge foot
    z = 30.0
    while z < 160:
        z += rr(5, 8)
        for xs in ((4.6, 5.5), (6.9, 7.9)):
            if xs[0] > 6 and not (32 <= z <= 105): continue
            x = sgn * rr(*xs)
            if free_pt(x, z, 0.3) and rng.random() < 0.6: strip.append(row('fern-a', x, z, rr(1.1, 1.5)))
    # flower patches in small groups of 2..3 every 6..10 m
    z = 29.0
    while z < 165:
        z += rr(6, 10)
        col = rng.choice(FLOWER_IDS)
        for _ in range(rng.randint(2, 3)):
            hedged = 32 <= z <= 105
            x = sgn * (rr(4.5, 5.6 if hedged else 6.2) if (rng.random() < 0.7 or not hedged) else rr(6.8, 8.1))
            zz = z + rr(-1.1, 1.1)
            if free_pt(x, zz): strip.append(row(col if rng.random() < 0.7 else rng.choice(FLOWER_IDS), x, zz, rr(0.9, 1.3)))
P += strip

# ---- (1) door dressing: 2..4 props at every house door; the opening in front of each door stays clear ---------------
# Model A (hashPick 0) has its door centred on the +Z (north) face; model B (porch, stairs on the west) on the -Z (south) face; the lateral axis flips with the facing. Slots are
# (lateral, out): lateral along +X for a south door, out from the footprint edge plus 0.4 m (the row builder drops anything
# inside footprint + 0.4). The clear door lane is lateral -3.4..+1.6 (stairs side and 1.4 m past the door axis).
BIG = ['woodpile-chop', 'wheelbarrow', 'garden-bed-a', 'haybale-a']
SMALL = ['barrel', 'crate_A_small', 'sack', 'bucket_empty']
def hashpick(s_, n):  # src/assets/swap/fit.ts hashPick: which Hexagon house model (A or B) a structure gets
    h = 2166136261
    for ch in s_:
        h ^= ord(ch); h = (h * 16777619) & 0xFFFFFFFF
    return h % n
DOORS = []  # (sid, x, z on the wall line, outward normal fx, fz)
for sid, kind, x, z, w, d in structs:
    if kind == 'house': DOORS.append((sid, x, z + d / 2, 0, 1) if hashpick(sid, 2) == 0 else (sid, x, z - d / 2, 0, -1))  # A faces +Z, B faces -Z
    elif kind == 'tavern': DOORS.append((sid, x, z - d / 2, 0, -1))  # to be set from the real model (see TAVERN_FACE)
DOORS.append(('bakery', 19.0, 132.0, -1, 0))  # enterable shell, door on the west wall (x 19)
def slot_ok(x, z):
    c = cell(x, z)
    if c is None or lane_pt(x, z) or any((x - fx) ** 2 + (z - fz) ** 2 < 3.0 ** 2 for fx, fz in FIRE): return False
    for sid, kind, sx, sz, w, d in structs:
        m = 0.8 if kind in ('fence', 'gate', 'cart') else 0.6
        if kind == 'yard-fence': continue
        if abs(x - sx) <= w / 2 + m and abs(z - sz) <= d / 2 + m: return False
    if any((x - ax) ** 2 + (z - az) ** 2 < 1.4 ** 2 for _, ax, az, _ in anchors): return False
    if any((x - lx) ** 2 + (z - lz) ** 2 < 1.0 ** 2 for lx, lz in LANTERNS): return False
    return True
door_rows = []
for sid, dx, dz, fx, fz in DOORS:
    lx_, lz_ = -fz, fx  # lateral axis (+X for a south door)
    if sid == 'bakery': slots = [(3.2, 0.9), (-3.2, 0.9), (4.2, 1.8), (-4.2, 1.8)]
    elif sid == 'tavern': slots = [(4.0, 1.2), (5.6, 2.0), (-7.0, 1.2), (3.6, 3.0)]  # porch and stairs on the west, 12 m wide front
    elif fz > 0: slots = [(2.8, 1.0), (-2.8, 1.0), (4.0, 1.9), (-4.0, 1.9)]  # model A: door centred, no stairs
    else: slots = [(2.4, 1.0), (3.7, 1.6), (3.0, 2.8), (-5.4, 1.0), (-4.6, 2.4)]  # model B: stairs to the west of the porch
    n = rng.randint(2, 4)
    chosen = []
    for lat, out in slots:
        if len(chosen) >= n: break
        x = dx + lat * lx_ + (out + 0.4) * fx
        z = dz + lat * lz_ + (out + 0.4) * fz
        if not slot_ok(x, z): continue
        if any(math.hypot(x - cx_, z - cz_) < 1.3 for cx_, cz_ in chosen): continue
        chosen.append((x, z))
        pid = rng.choice(BIG) if len(chosen) == 1 else (rng.choice(BIG) if (len(chosen) == 3 and rng.random() < 0.5) else rng.choice(SMALL + ['barrel', 'crate_A_small']))
        door_rows.append(row(pid, x, z, 1.0, yaw=(math.degrees(math.atan2(fx, fz)) + rr(-25, 25)) % 360, near=sid))
    if len(chosen) < 2: print('WARN door', sid, 'only', len(chosen), 'props')
P += door_rows

# ---- (5) Kettlewick green: flower ring round the well, edge trees, tufts where the green meets the house plots -------
WELL = (0.0, 130.0)
ring = []
for rad, nflw, jit in ((8.6, 30, 0.5), (5.6, 14, 0.4)):
    for k in range(nflw):
        a = 2 * math.pi * (k + rr(-0.25, 0.25)) / nflw
        rd = rad + rr(-jit, jit)
        x, z = WELL[0] + rd * math.cos(a), WELL[1] + rd * math.sin(a)
        if not free_pt(x, z): continue
        if rad < 6 and k % 3 == 0: ring.append(row('grass-clump-b', x, z, rr(0.9, 1.2)))
        else: ring.append(row(FLOWER_IDS[(k // 2) % 4], x, z, rr(0.95, 1.35)))
P += ring
# two birches and an elm on the edge of the green, clear of the lane, the houses and the trigger spheres (first free candidate)
edge_trees = []
for kid, cands in (('birch-a', [(-15, 112), (-14, 114), (-13, 109), (-12, 116)]), ('birch-b', [(14, 140), (13, 142), (15, 138), (13, 144)]), ('elm-or-ash-a', [(-14, 145), (-13, 143), (-15, 147), (-12, 141)])):
    for x, z in cands:
        c = cell(x, z)
        if c is not None and not bare[c] and not tall_free[c] and all((x - qx) ** 2 + (z - qz) ** 2 > 5.0 ** 2 for qx, qz in placed):
            placed.append((x, z)); edge_trees.append(row(kid, x, z, rr(0.9, 1.2), edge=True)); break
    else: print('WARN no spot for edge tree', kid)
P += edge_trees
# tufts where the green meets the house plots: a loose ring 1.8..2.4 m outside each Kettlewick footprint, none in front of a door
tufts = []
for sid, kind, sx, sz, w, d in structs:
    if kind not in HOUSE_KINDS or sz < 98: continue
    hw, hd = w / 2 + 2.1, d / 2 + 2.1
    n_ = int(2 * (hw + hd) * 2 / 1.7)
    for k in range(n_):
        u = k / n_ * 4
        side, f = int(u), u - int(u)
        if side == 0: px_, pz_ = -hw + 2 * hw * f, -hd
        elif side == 1: px_, pz_ = hw, -hd + 2 * hd * f
        elif side == 2: px_, pz_ = hw - 2 * hw * f, hd
        else: px_, pz_ = -hw, hd - 2 * hd * f
        x, z = px_ + sx + rr(-0.3, 0.5), pz_ + sz + rr(-0.3, 0.5)
        if rng.random() > 0.55: continue
        if any(math.hypot(x - ddx - fx_ * 2.5, z - ddz - fz_ * 2.5) < 5.5 for s_, ddx, ddz, fx_, fz_ in DOORS if s_ == sid): continue  # door front: props and the clear lane
        if not free_pt(x, z): continue
        tufts.append(row(rng.choice(GRASS_IDS + ['grass-clump-c']) if rng.random() < 0.8 else rng.choice(FLOWER_IDS), x, z, rr(0.9, 1.4)))
P += tufts

# drop anything inside the solid mask (except hedges, lanterns, door props, edge trees and the hand-placed strips)
HAND = {id(p) for p in strip + ring + tufts}
def ok(p):
    if p['id'] in ('hedge-straight', 'post_lantern') or 'near' in p or p.get('landmark') or p.get('edge') or id(p) in HAND: return True
    ix, iz = int(p['x'] - X0), int(p['z'] - Z0)
    if p['id'].startswith(GROUND_IDS) and (lane_pt(p['x'], p['z']) or chapel_pt(p['x'], p['z'])): return False
    return not (bare[iz, ix] or (tall_free[iz, ix] and p['id'] in TALL))
P = [p for p in P if ok(p)]
for p in P:
    p.pop('edge', None)
json.dump({'tile': 'b1', 'core': {'x': [-100, 160], 'z': [-30, 230]}, 'overlap': 52, 'structures': [{'id': a, 'kind': b, 'x': c, 'z': d, 'w': e, 'd': f} for a, b, c, d, e, f in structs], 'placements': P}, open(f'{OUT}/b1.placements.json', 'w'))
counts = {}
for p in P: counts[p['id']] = counts.get(p['id'], 0) + 1
json.dump(dict(sorted(counts.items(), key=lambda kv: -kv[1])), open(f'{OUT}/b1.counts.json', 'w'), indent=1)

# placement plan image
img = overlay(Image.fromarray(np.flipud(np.zeros(GX.shape + (3,)) + np.array([56, 74, 52])).astype(np.uint8)).resize((W, H), Image.NEAREST))
dr = ImageDraw.Draw(img)
col = {'oak': (20, 120, 40), 'bir': (180, 220, 120), 'elm': (60, 150, 60), 'aut': (230, 140, 40), 'bus': (150, 200, 60), 'roc': (190, 190, 200), 'bou': (150, 150, 160), 'stu': (150, 100, 60), 'log': (130, 90, 50), 'mus': (230, 80, 80), 'fer': (80, 170, 100), 'fle': (240, 100, 200), 'gra': (140, 190, 80), 'hed': (30, 110, 50), 'pos': (255, 200, 80)}
rad = {'oak': 5, 'bir': 3, 'elm': 4, 'aut': 4, 'bus': 1.2, 'roc': 1, 'bou': 1.6, 'hed': 1.8}
for p in P:
    c = col.get(p['id'][:3], (240, 240, 240)); r = rad.get(p['id'][:3], 0.8) * PX
    x, y = (p['x'] - X0) * PX, (Z1 - p['z']) * PX
    dr.ellipse([x - r, y - r, x + r, y + r], fill=c)
img.save(f'{OUT}/plan-placements.png')
print(len(P), 'placements', counts)
