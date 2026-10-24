# Top-down hillshade of tools/act3-world/grid.f32 (north up): python3 tools/act3-world/hillshade.py out.png
import json, math, struct, sys
from PIL import Image
meta = json.load(open('tools/act3-world/grid.json'))
nx, nz, step = meta['nx'], meta['nz'], meta['step']
raw = open('tools/act3-world/grid.f32', 'rb').read()
h = struct.unpack('<%df' % (nx * nz), raw)
img = Image.new('RGB', (nx, nz))
px = img.load()
az, alt = math.radians(315), math.radians(40)
lx, ly, lz = math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)
ramp = [(-40, (40, 60, 120)), (0, (70, 110, 70)), (60, (95, 125, 70)), (200, (130, 120, 85)), (400, (120, 105, 95)), (520, (190, 190, 195)), (640, (255, 255, 255))]
def colour(v):
    for (a, ca), (b, cb) in zip(ramp, ramp[1:]):
        if v <= b:
            t = max(0.0, min(1.0, (v - a) / (b - a)))
            return [ca[i] + (cb[i] - ca[i]) * t for i in range(3)]
    return list(ramp[-1][1])
for j in range(nz):
    for i in range(nx):
        c = h[j * nx + i]
        e = h[j * nx + min(i + 1, nx - 1)] - h[j * nx + max(i - 1, 0)]
        n = h[max(j - 1, 0) * nx + i] - h[min(j + 1, nz - 1) * nx + i]
        dx, dy = -e / (2 * step), -n / (2 * step)
        norm = math.sqrt(dx * dx + dy * dy + 1)
        shade = max(0.0, (dx * lx + dy * ly + lz) / norm)
        col = colour(c)
        k = 0.35 + 0.85 * shade
        px[i, j] = tuple(int(max(0, min(255, col[t] * k))) for t in range(3))
img.save(sys.argv[1])
print('saved', sys.argv[1], nx, nz)
