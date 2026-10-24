"""B4 designer step: density maps and placements for tile B4 (the Quenchstone Shrine and the east road to the Harrowmark fog wall).
Run: python3 gen_b4.py [outDir]        (default: the folder of this script)
Reads /home/claude/openworld/src/region/ANCHORS.md (override with env ANCHORS_MD) so the keep-outs are the game's own.
Writes density-<layer>.png, density-all.png, plan-placements.png, b4.placements.json, b4.counts.json.
Coordinates: metres, +Z north. Tile core x 700..1100, z -300..200; overlap band 52 m (blend only). Seed fixed: 4404.
The ash gradient: the land is green at x 700 and grey by the fog wall at x 1100 (design 5.1: the south and east edges are grey at the
end of Act 1); the Quenchstone is still warm, so a green halo of about 26 m survives round the basin.
"""
import json, math, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envlib import Ctx, seg_dist

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
CORE, BAND = (700, 1100, -300, 200), 52
WINDOW = (CORE[0] - BAND, CORE[1] + BAND, CORE[2] - BAND, CORE[3] + BAND)
ROAD = [(560, -150, 1160, -150, 3.0)]                       # Dead Road, ROAD_Z -150, width 6; the shaped road continues east of the fog wall
SHRINE = (965, -165)
ASH = dict(x0=800, x1=1040, south=0.8, z0=215, z1=330, halo=[965, -165, 26])
PAD = (995, -168, 14, 14)                                    # reserved: the Rekindled Hearth hub (design 12.4) next to the shrine; ground cover only

C = Ctx('b4', CORE, BAND, WINDOW, 4404, road=ROAD, water=[], extra_solid=[(PAD[0], PAD[1], PAD[2] + 2, PAD[3] + 2)])  # 2 m clear of the pad all round (builder ruling: the pad stays empty)
GX, GZ, rng = C.GX, C.GZ, C.rng
NL, NM, NS = C.vnoise(80, 21), C.vnoise(28, 22), C.vnoise(9, 23)
OWN = C.ownership()
sm = lambda a, b, v: (lambda t: t * t * (3 - 2 * t))(np.clip((v - a) / (b - a), 0, 1))
def ash_at(x, z):
    v = np.maximum(sm(ASH['x0'], ASH['x1'], x), ASH['south'] * sm(ASH['z0'], ASH['z1'], -z))
    d = np.hypot(x - ASH['halo'][0], z - ASH['halo'][1])
    return v * (1 - 0.9 * np.exp(-((d / ASH['halo'][2]) ** 2)))
ASHG = ash_at(GX, GZ)
dshrine = np.hypot(GX - SHRINE[0], GZ - SHRINE[1])
lush = np.exp(-((dshrine / 30) ** 2))
droad = seg_dist(GX, GZ, *ROAD[0][:4]) - 3.0
wardzone = (GX < 830) & (np.abs(GZ + 150) < 14)             # M05: wraiths cross here, keep the combat ground open (no trees, few bushes)
apron = dshrine < 6.5                                       # the stone basin and its paved apron: no ground cover
pilgrim = (np.abs(GX - SHRINE[0]) < 1.6) & (GZ > SHRINE[1] + 5) & (GZ < -152.5)  # the short trodden path from the road to the basin

L = {}
belt = ((droad > 8) & (droad < 30)) * np.clip(NM * 1.6 - 0.35, 0, 1)                  # roadside belt: broken tree groups either side of the road so the long road has rhythm
L['trees'] = (0.012 + 0.10 * np.clip(NL - 0.5, 0, 1) * 2 + 0.16 * belt) * (1 + 0.9 * ASHG) * (droad > 6) * (~wardzone) * (1 - 0.9 * np.exp(-(dshrine / 12) ** 2))
L['bushes'] = (0.03 + 0.09 * np.clip(NM - 0.4, 0, 1) + 0.07 * lush + 0.12 * ((droad > 0.6) & (droad < 10)) * NS) * (1 - 0.55 * ASHG) * (1 - 0.7 * wardzone)
L['grass'] = (0.55 + 1.7 * np.clip(NM - 0.3, 0, 1) + 1.1 * lush) * (1 - 0.3 * ASHG)
L['flowers'] = (0.05 + 0.70 * np.clip(NS * NM - 0.25, 0, 1)) * (1 - ASHG) ** 2 + 2.0 * lush * np.clip(NS - 0.15, 0, 1)
L['rocks'] = 0.02 + 0.12 * np.clip(NL - 0.5, 0, 1) + 0.05 * ASHG * (NS > 0.4) + 0.03 * ((droad > 0.6) & (droad < 12)) * (NS > 0.55)
L['wood'] = 0.010 + 0.04 * np.clip(NL - 0.5, 0, 1) * (NS > 0.4) + 0.045 * ASHG * (NS > 0.35)
for k in L:
    L[k] = L[k] * OWN
    L[k][C.block_mask('tree' if k == 'trees' else 'ground' if k in ('grass', 'flowers') else 'small')] = 0
for k in ('grass', 'flowers'): L[k][apron | pilgrim] = 0
specs = {'trees': (0.16, (80, 200, 90)), 'bushes': (0.30, (150, 220, 80)), 'grass': (2.2, (190, 230, 90)), 'flowers': (1.6, (240, 120, 200)), 'rocks': (0.16, (200, 200, 210)), 'wood': (0.08, (210, 150, 90))}
C.save_density(OUT, L, specs)

def mk(f):
    def g(x, z, r): return f(float(ash_at(x, z)), r)
    return g
def wchoice(r, items):
    w = np.array([i[1] for i in items], float); w /= w.sum(); i = items[int(r.choice(len(items), p=w))]; return i[0], i[2], i[3], i[4]
def tree_pick(a, r):
    if a < 0.28: return wchoice(r, [('oak-a', .22, 3.4, .8, 1), ('oak-b', .16, 3.2, .8, 1), ('oak-c', .14, 3.6, .9, 1), ('birch-a', .18, 1.8, .3, 1), ('birch-b', .14, 1.8, .3, 1), ('elm-or-ash-a', .16, 2.4, .5, 1)])
    if a < 0.6: return wchoice(r, [('autumn-tree-a', .30, 2.6, .6, 1), ('oak-ash-a', .22, 3.2, .8, 1), ('birch-b', .12, 1.8, .3, 1), ('ash-tree-dead-a', .2, 1.5, .4, 1), ('ash-tree-dead-b', .16, 1.5, .4, 1)])
    return wchoice(r, [('ash-tree-dead-a', .38, 1.5, .4, 1), ('ash-tree-dead-b', .34, 1.5, .4, 1), ('oak-ash-a', .22, 3.2, .8, 1), ('autumn-tree-a', .06, 2.6, .6, 1)])
def bush_pick(a, r):
    if a < 0.4: return wchoice(r, [('bush-round-a', .27, 1.1, .7, 1), ('bush-round-b', .21, 1.1, .7, 1), ('bush-flowering-a', .17, 1.1, .7, 1), ('bush-flowering-b', .13, 1.1, .7, 1), ('fern-a', .22, .8, .4, 1)])
    return wchoice(r, [('bush-round-ash', .75, 1.1, .7, 1), ('fern-a', .05, .8, .4, 1), ('bush-round-b', .2, 1.1, .7, 1)])
def rock_pick(a, r): return wchoice(r, [('rock-cluster-a', .28, 1.8, 1.0, 1), ('boulder-large-a', .2, 2.2, 1.3, 1), ('boulder-large-b', .16, 2.2, 1.3, 1), ('rock_single_A', .12, 1.0, .5, 1), ('rock_single_B', .13, 1.0, .5, 1), ('rock_single_C', .11, 1.0, .6, 1)])
def wood_pick(a, r):
    if a < 0.4: return wchoice(r, [('stump-a', .22, 1.6, .5, 1), ('stump-b', .14, 1.6, .5, 1), ('log-fallen-a', .16, 2.2, .6, 1), ('mushrooms-a', .26, 1.0, .25, 1), ('fern-a', .22, 1.0, .4, 1)])
    return wchoice(r, [('charred-stump', .45, 1.4, .5, 1), ('log-fallen-a', .2, 2.2, .6, 1), ('stump-b', .2, 1.6, .5, 1), ('charred-stump', .15, 1.4, .5, 1)])
def flower_pick(a, r): return wchoice(r, [('flower-patch-yellow', .3, .9, .3, 1), ('flower-patch-white', .3, .9, .3, 1), ('flower-patch-purple', .22, .9, .3, 1), ('flower-patch-red', .18, .9, .3, 1)])
def grass_pick(a, r):
    if a > 0.42: return wchoice(r, [('grass-clump-ash', .8, .8, .3, 1), ('grass-clump-b', .2, .8, .3, 1)])
    return wchoice(r, [('grass-clump-a', .36, .8, .3, 1), ('grass-clump-b', .34, .8, .3, 1), ('grass-clump-c', .3, .8, .3, 1)])

region_g_pre = lambda x, z: math.hypot(x - SHRINE[0], z - SHRINE[1]) >= 6.5 and not (abs(x - SHRINE[0]) < 1.6 and SHRINE[1] + 5 < z < -152.5) and not (abs(x - PAD[0]) <= PAD[2] + 2 and abs(z - PAD[1]) <= PAD[3] + 2)
# ---- hand-authored first -------------------------------------------------------------------------------------------------------
# 1. The Quenchstone Shrine: a clearing between two old oaks, a broken ring of dark basalt columns to the south, ferns and flowers in the warm halo.
sx, sz = SHRINE
C.put('oak-a', 941, -188, 20, 1.2, 'tree', 3.6, 1.0, note='landmark: shades the pilgrim approach, the last big green tree before the fog wall')
C.put('oak-c', 991, -190, 140, 1.15, 'tree', 3.6, 1.0, note='landmark')
for a in (150, 192, 232, 272, 316): C.put('basalt-columns-a', sx + rng.uniform(15, 17.5) * math.cos(math.radians(a)), sz + rng.uniform(15, 17.5) * math.sin(math.radians(a)), None, 1.0, 'small', 2.2, 1.6, note='ring of cooled basalt, open to the road')
for a in np.arange(0, 360, 30):
    for n, d in (('fern-a', rng.uniform(8, 11.5)), ('flower-patch-white', rng.uniform(7.5, 10)), ('fern-a', rng.uniform(11, 14))): C.put(n, sx + d * math.cos(math.radians(a + rng.uniform(-8, 8))), sz + d * math.sin(math.radians(a)), None, 1.0, 'ground' if n.startswith('flower') else 'small', .8, .4)
for a in (110, 250, 305): C.put('bush-flowering-a', sx + 13 * math.cos(math.radians(a)), sz + 13 * math.sin(math.radians(a)), None, 1.0, 'small', 1.1, .7)
for x in (959.5, 970.5): C.put('post_lantern', x, -145.9, 0, 1.0, 'road', .5, .3, note='lamps at the shrine turn-off, either side of the pilgrim path')
C.put('signpost-a', 947, -153.9, 90, 1.0, 'road', .6, .3, note='points south to the shrine')

# 2. Road rhythm: a milestone every 100 m (alternating sides), crow posts and broken fences in the ash reach, gateposts and wrecks at the fog wall
for x, z in ((720, -146.1), (820, -153.9), (920, -146.1), (1020, -153.9)): C.put('milestone-a', x, z, 0 if z > -150 else 180, 1.0, 'road', .5, .3)
for k, x in enumerate(np.arange(890, 1095, 29)): C.put('crow-perch-post', x + rng.uniform(-4, 4), -150 + (7 if k % 2 else -7) + rng.uniform(-1, 1), None, 1.0, 'road', .6, .3)
for k, x in enumerate((905, 933, 1000, 1030, 1048)): C.put('fence_broken', x, -150 + (9.5 if k % 2 else -9.5), 0 if k % 2 else 180, 1.0, 'small', 1.6, .8, note='collapsed field fence, ash side')
C.put('wagon-wreck-a', 1018, -158.5, 20, 1.0, 'small', 2.4, 1.5, note='a convoy that did not reach Harrowmark'); C.put('wagon-wreck-a', 1056, -141.5, 160, 1.0, 'small', 2.4, 1.5)
C.put('wagon-burnt', 1081, -157.0, 100, 1.0, 'small', 2.4, 1.5)
for z in (-156.0, -144.0): C.put('pillar', 1072, z, 0, 1.0, 'small', .8, .5, note='broken gateposts framing the road into the fog wall')


# 2b. Road verges (B1 review lesson): a continuous 0.7 to 2.9 m strip of long grass, ferns and flowers either side of the road, going
# ash grey with the gradient, plus a scrub bush every ~11 m outside the M05 combat ground. The road surface itself stays bare.
def verge_pick(a, r):
    u = r.random()
    if a > 0.42: return ('grass-clump-ash' if u < .78 else 'grass-clump-b'), .8
    if u < .16: return 'fern-a', .85
    if u < .27 and a < 0.3: return ['flower-patch-yellow', 'flower-patch-white', 'flower-patch-purple', 'flower-patch-red'][int(r.integers(4))], .9
    return ['grass-clump-a', 'grass-clump-b', 'grass-clump-c'][int(r.integers(3))], .9
for side in (-1, 1):
    x = 701.0
    while x < 1099:
        z = -150 + side * (3.7 + rng.uniform(0, 2.2)); a = float(ash_at(x, z))
        i, sc = verge_pick(a, rng)
        if region_g_pre(x, z): C.put(i, x, z, None, sc, 'ground', .55, .2, jitter=.25)
        x += rng.uniform(0.9, 2.1)
    x = 706.0
    while x < 1096:
        a = float(ash_at(x, -150))
        if not (x < 830) and (abs(x - 1072) > 8):
            z = -150 + side * rng.uniform(5.2, 8.5)
            C.put('bush-round-ash' if a > 0.4 else ('bush-round-a' if rng.random() < .6 else 'bush-flowering-b'), x, z, None, 1.0, 'small', 1.1, .7, jitter=.15)
        x += rng.uniform(8, 15)

# 3. M05 wardstone 5 (780, -146) and the lore stone at (700, -168)
for n, d0, d1 in (('rock_single_B', 2.5, 3.4), ('rock_single_B', 2.5, 3.4), ('gravemarker_A', 2.6, 3.8), ('gravemarker_A', 2.6, 3.8)): C.put_near(n, 780, -146, d0, d1, 'small', .6, .4, a0=0, a1=180)
for n in ('rock-cluster-a', 'rock-cluster-a', 'fern-a', 'fern-a', 'fern-a'): C.put_near(n, 700, -168, 3, 5.5, 'small', 1.0, .6)
for a in (200, 300): C.put('birch-a', 700 + 9 * math.cos(math.radians(a)), -168 + 9 * math.sin(math.radians(a)), None, 1.0, 'tree', 1.8, .4)

# 4. The barrow (860, -126): a stone ring, graves, dead trees behind, no mound (terrain keeps the anchors flat)
for a in np.arange(0, 360, 36): C.put('rock_single_C', 860 + rng.uniform(7, 8.6) * math.cos(math.radians(a)), -126 + rng.uniform(7, 8.6) * math.sin(math.radians(a)), None, 1.15, 'small', 1.0, .7, note='barrow ring')
for a in (60, 140, 250): C.put('boulder-large-a', 860 + 11.5 * math.cos(math.radians(a)), -126 + 11.5 * math.sin(math.radians(a)), None, 0.9, 'small', 2.2, 1.3)
for n in ('grave_A', 'grave_A', 'gravemarker_A', 'gravemarker_A', 'gravemarker_A', 'gravemarker_A'): C.put_near(n, 860, -126, 4.5, 6.5, 'small', .8, .5)
for x, z in ((851, -111), (871, -113), (858, -105)): C.put('ash-tree-dead-b' if x > 855 else 'ash-tree-dead-a', x, z, None, 1.0, 'tree', 1.5, .4)
C.put('crow-perch-post', 846, -131, None, 1.0, 'small', .6, .3); C.put('crow-perch-post', 874, -131, None, 1.0, 'small', .6, .3)

# 5. Copses and outcrops
def copse(cx, cz, n, mix, rad=8.5, under=('bush-round-a', 'bush-flowering-b', 'fern-a', 'fern-a', 'mushrooms-a', 'stump-a', 'log-fallen-a')):
    for _ in range(n):
        for _t in range(40):
            a, d = rng.uniform(0, 6.283), rad * math.sqrt(rng.random()); i = mix[int(rng.integers(len(mix)))]
            rr = 3.2 if i.startswith('oak') else 1.8 if i.startswith('birch') else 1.5 if i.startswith('ash') else 2.4
            if C.put(i, cx + d * math.cos(a), cz + d * math.sin(a), None, 1.0, 'tree', rr, .7, jitter=.15): break
    for n_ in under: C.put_near(n_, cx, cz, 2.5, rad + 3, 'small', 1.0, .6)
LIVE = ['oak-a', 'oak-b', 'oak-c', 'birch-a', 'birch-b', 'elm-or-ash-a', 'autumn-tree-a']
for cx, cz, n in ((745, -60, 7), (792, -240, 6), (838, -62, 6), (720, 70, 6), (800, 150, 6), (880, 40, 5), (760, -290, 5)): copse(cx, cz, n, LIVE)
for cx, cz, n in ((932, 100, 6), (1030, 120, 6)): copse(cx, cz, n, ['birch-a', 'birch-b', 'autumn-tree-a', 'oak-ash-a', 'ash-tree-dead-a'])
for cx, cz, n in ((1040, -60, 7), (1050, -250, 7), (975, -250, 6), (1085, 140, 5)): copse(cx, cz, n, ['ash-tree-dead-a', 'ash-tree-dead-b', 'ash-tree-dead-a', 'oak-ash-a'], 9, ('charred-stump', 'charred-stump', 'rock_single_A', 'bush-round-ash', 'log-fallen-a'))
for cx, cz in ((900, 100), (1030, 165), (775, 180), (905, -255)):
    for n in ('boulder-large-a', 'boulder-large-b', 'boulder-large-a', 'rock-cluster-a', 'rock-cluster-a', 'rock_single_B'): C.put_near(n, cx, cz, 1.5, 8, 'small', 2.0, 1.2)

# ---- scatter ---------------------------------------------------------------------------------------------------------------------
region_g = lambda x, z: math.hypot(x - sx, z - sz) >= 6.5 and not (abs(x - sx) < 1.6 and sz + 5 < z < -152.5) and not (abs(x - PAD[0]) <= PAD[2] + 2 and abs(z - PAD[1]) <= PAD[3] + 2)
C.scatter(L['trees'], 'tree', mk(tree_pick), 0.15)
C.scatter(L['rocks'], 'small', mk(rock_pick), 0.22)
C.scatter(L['bushes'], 'small', mk(bush_pick), 0.12)
C.scatter(L['wood'], 'small', mk(wood_pick), 0.12)
C.scatter(L['flowers'], 'ground', mk(flower_pick), 0.2, region_ok=region_g)
C.scatter(L['grass'], 'ground', mk(grass_pick), 0.25, region_ok=region_g)


# ---- coordinator review lessons (B2 shot review) ---------------------------------------------------------------------------------
# a. Near-field density around each eye camera: ground tufts and 2 to 4 m patches within 25 m (grass, ferns, flowers or ash tufts).
def patch_pick(a, r):
    if a > 0.42: return ('grass-clump-ash' if r.random() < .85 else 'grass-clump-b'), .9
    u = r.random()
    if u < .22: return 'fern-a', .9
    if u < .34 and a < .3: return ['flower-patch-yellow', 'flower-patch-white', 'flower-patch-purple', 'flower-patch-red'][int(r.integers(4))], .9
    return ['grass-clump-a', 'grass-clump-b', 'grass-clump-c'][int(r.integers(3))], .95
# Tile-wide (coordinator standing rule: the density map drives placement, not the camera list): 2 to 4 m patches of 4 to 7 tufts
# across every open stretch of the core, accepted in proportion to the grass density map.
for _ in range(3600):
    cx, cz = rng.uniform(CORE[0], CORE[1]), rng.uniform(CORE[2], CORE[3])
    if rng.random() > min(1.0, float(C.at(L["grass"], cx, cz)) / 1.1): continue
    for _k in range(int(rng.integers(4, 8))):
        x, z = cx + rng.uniform(-2, 2), cz + rng.uniform(-2, 2)
        if region_g_pre(x, z) and math.hypot(x - SHRINE[0], z - SHRINE[1]) >= 11:
            i, sc = patch_pick(float(ash_at(x, z)), rng)
            C.put(i, x, z, None, sc, 'ground', .45, .15, jitter=.3)
# b. Cairns and extra dead ground in the ash reach
for cx, cz in ((1030, -135), (1052, -168), (1066, -128), (1020, -122), (1090, -170), (1000, -214), (1045, -200)):
    for n in ('rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_A'): C.put_near(n, cx, cz, 0.3, 1.3, 'small', .5, .3, scale=1.0)
# c. crow posts read as objects: a broken fence rail as the crossbar beside each post
for r_ in list(C.rows):
    if r_['id'] == 'crow-perch-post': C.put('fence_broken', r_['x'] + .5, r_['z'] + .3, r_['yaw'], .45, 'small', .4, .2, force=True)

# d0. foreground ferns and flowers at about 0.7 (coordinator standing rule)
for r_ in C.rows:
    if r_['id'].startswith(('fern-a', 'flower-patch')): r_['scale'] = round(r_['scale'] * 0.7, 3)
# d. oaks at 0.5 to 0.6 of the designer's size, scale 0.8 to 1.2 randomised (copses no longer 12 to 15 m crowns); no flowers where ash > 0.5
for r_ in C.rows:
    if re.match(r'oak-(a|b|c|ash-a)$', r_['id']):
        r_['scale'] = round(r_['scale'] * 0.55 * float(rng.uniform(0.8, 1.2)), 3)
C.rows[:] = [r_ for r_ in C.rows if not (r_['id'].startswith('flower') and float(ash_at(r_['x'], r_['z'])) > 0.5)]
by_id, by_cls = C.write(OUT, 'b4', extra={'meta': {'ash': ASH, 'reserved': [{'id': 'rekindled-hearth-pad', 'x': PAD[0], 'z': PAD[1], 'halfW': PAD[2], 'halfD': PAD[3]}]}})
C.save_plan(OUT)
print(len(C.rows), 'rows', by_cls, 'dropped', C.dropped, 'violations', C.verify())
