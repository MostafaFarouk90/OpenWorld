# Walkable flood fill (slope <= 1 between 10 m grid neighbours) from the lodge: is the Aerie reachable on foot?
import json, struct, sys
from collections import deque
m = json.load(open('tools/act3-world/grid.json'))
nx, nz, st, x0, z1 = m['nx'], m['nz'], m['step'], m['x0'], m['z1']
h = struct.unpack('<%df' % (nx * nz), open('tools/act3-world/grid.f32', 'rb').read())
idx = lambda x, z: int(round((z1 - z) / st)) * nx + int(round((x - x0) / st))
lim = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
seen = bytearray(nx * nz)
q = deque([idx(13600, 11900)]); seen[q[0]] = 1
while q:
    k = q.popleft(); j, i = divmod(k, nx)
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        jj, ii = j + dj, i + di
        if 0 <= jj < nz and 0 <= ii < nx:
            kk = jj * nx + ii
            if not seen[kk] and abs(h[kk] - h[k]) <= lim * st:
                seen[kk] = 1; q.append(kk)
for name, x, z in [('aerie', 15600, 16040), ('keep', 15600, 16120), ('hearth', 13600, 15600), ('skyhold', 12230, 15200), ('anvil', 14700, 13900), ('chasm floor', 14750, 16000)]:
    print(name, bool(seen[idx(x, z)]))
# Path into the Aerie (cells above 500 m within 700 m of the shelf), printed every 10 cells.
par = {}
seen2 = bytearray(nx * nz)
s0 = idx(13600, 11900); q = deque([s0]); seen2[s0] = 1
while q:
    k = q.popleft(); j, i = divmod(k, nx)
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        jj, ii = j + dj, i + di
        if 0 <= jj < nz and 0 <= ii < nx:
            kk = jj * nx + ii
            if not seen2[kk] and abs(h[kk] - h[k]) <= lim * st:
                seen2[kk] = 1; par[kk] = k; q.append(kk)
k = idx(15600, 16040); path = []
while k in par: path.append(k); k = par[k]
path.reverse()
for n, k in enumerate(path):
    j, i = divmod(k, nx)
    if n % 15 == 0 or n > len(path) - 40 and n % 5 == 0: print(x0 + i * st, z1 - j * st, round(h[k]))
