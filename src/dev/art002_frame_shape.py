"""Read-only shape analysis for ART-002 gallery frame (central opening check)."""
import json
import struct
from pathlib import Path

import numpy as np

PATH = Path("art-pipeline/generated/originals/ART-002-gallery-frame-v1.glb")
raw = PATH.read_bytes()
magic, version, declared = struct.unpack_from("<4sII", raw)
assert magic == b"glTF" and version == 2 and declared == len(raw)
pos = 12
doc = None
bin_chunk = b""
while pos < len(raw):
    length, kind = struct.unpack_from("<II", raw, pos)
    pos += 8
    chunk = raw[pos:pos + length]
    pos += length
    if kind == 0x4E4F534A:
        doc = json.loads(chunk.decode("utf-8"))
    if kind == 0x004E4942:
        bin_chunk = chunk


def accessor(index):
    a = doc["accessors"][index]
    view = doc["bufferViews"][a["bufferView"]]
    count = a["count"]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
    dtype = {5125: np.uint32, 5126: np.float32, 5123: np.uint16}[a["componentType"]]
    offset = (view.get("byteOffset", 0) + a.get("byteOffset", 0))
    stride = view.get("byteStride", None)
    if stride is None:
        return np.frombuffer(bin_chunk, dtype=dtype, count=count * comps, offset=offset).reshape(count, comps)
    raise RuntimeError("interleaved accessor not needed")


mesh = next(node["mesh"] for node in doc["nodes"] if "mesh" in node)
prim = doc["meshes"][mesh]["primitives"][0]
positions = accessor(prim["attributes"]["POSITION"]).astype(np.float64)
indices = accessor(prim["indices"]).astype(np.int64).reshape(-1, 3)
lo = positions.min(axis=0)
hi = positions.max(axis=0)
size = hi - lo
tri = positions[indices]
centroids = tri.mean(axis=1)

# Bin triangles by projected XY centroid.
GRID = 48
bin_x = np.clip(((centroids[:, 0] - lo[0]) / size[0] * GRID).astype(int), 0, GRID - 1)
bin_y = np.clip(((centroids[:, 1] - lo[1]) / size[1] * GRID).astype(int), 0, GRID - 1)
bins = {}
for t, (bx, by) in enumerate(zip(bin_x, bin_y)):
    bins.setdefault((bx, by), []).append(t)

SAMPLE = 80
covered = np.zeros((SAMPLE, SAMPLE), dtype=bool)
depth_min = np.full((SAMPLE, SAMPLE), np.inf)
depth_max = np.full((SAMPLE, SAMPLE), -np.inf)
hit_count = np.zeros((SAMPLE, SAMPLE), dtype=np.int32)
for sy in range(SAMPLE):
    wy = lo[1] + (sy + 0.5) / SAMPLE * size[1]
    for sx in range(SAMPLE):
        wx = lo[0] + (sx + 0.5) / SAMPLE * size[0]
        bx = int(np.clip((wx - lo[0]) / size[0] * GRID, 0, GRID - 1))
        by = int(np.clip((wy - lo[1]) / size[1] * GRID, 0, GRID - 1))
        candidates = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                candidates.extend(bins.get((bx + dx, by + dy), []))
        if not candidates:
            continue
        c = tri[np.array(candidates)]
        ax, ay = c[:, 0, 0], c[:, 0, 1]
        bx_, by_ = c[:, 1, 0], c[:, 1, 1]
        cx, cy = c[:, 2, 0], c[:, 2, 1]
        v0x, v0y = bx_ - ax, by_ - ay
        v1x, v1y = cx - ax, cy - ay
        v2x, v2y = wx - ax, wy - ay
        den = v0x * v1y - v1x * v0y
        good = np.abs(den) > 1e-12
        u = np.where(good, (v2x * v1y - v1x * v2y) / den, -1)
        v = np.where(good, (v0x * v2y - v2x * v0y) / den, -1)
        inside = good & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9)
        if not inside.any():
            continue
        hits = c[inside]
        wz = hits[:, 0, 2] + u[inside] * (hits[:, 1, 2] - hits[:, 0, 2]) + v[inside] * (hits[:, 2, 2] - hits[:, 0, 2])
        covered[sy, sx] = True
        depth_min[sy, sx] = min(depth_min[sy, sx], float(wz.min()))
        depth_max[sy, sx] = max(depth_max[sy, sx], float(wz.max()))
        hit_count[sy, sx] = int(inside.sum())

inner = covered[
    int(SAMPLE * 0.25):int(SAMPLE * 0.75),
    int(SAMPLE * 0.2):int(SAMPLE * 0.8),
]
central = covered[
    int(SAMPLE * 0.3):int(SAMPLE * 0.7),
    int(SAMPLE * 0.25):int(SAMPLE * 0.75),
]
# Vertex-projected occupancy: more robust for finding a usable opening.
VERT_GRID = 256
vertex_occ = np.zeros((VERT_GRID, VERT_GRID), dtype=bool)
vx = np.clip(((positions[:, 0] - lo[0]) / size[0] * VERT_GRID).astype(int), 0, VERT_GRID - 1)
vy = np.clip(((positions[:, 1] - lo[1]) / size[1] * VERT_GRID).astype(int), 0, VERT_GRID - 1)
vertex_occ[vy, vx] = True
# Largest all-empty axis-aligned rectangle (classic histogram DP).
heights = np.zeros(VERT_GRID, dtype=int)
best_area = 0
best_rect = (0, 0, 0, 0)
for row in range(VERT_GRID):
    heights = np.where(vertex_occ[row], 0, heights + 1)
    stack = []
    for col in range(VERT_GRID + 1):
        current = heights[col] if col < VERT_GRID else 0
        start = col
        while stack and stack[-1][1] > current:
            index, height = stack.pop()
            area = height * (col - index)
            if area > best_area:
                best_area = area
                best_rect = (index, row - height + 1, col - index, height)
            start = index
        if not stack or stack[-1][1] < current:
            stack.append((start, current))
bx, by, bw, bh = best_rect
opening_norm = {
    "x0": bx / VERT_GRID,
    "x1": (bx + bw) / VERT_GRID,
    "y0": by / VERT_GRID,
    "y1": (by + bh) / VERT_GRID,
    "widthRatio": bw / VERT_GRID,
    "heightRatio": bh / VERT_GRID,
}
VERT_ASCII = 60
vert_map = ""
for gy in range(VERT_ASCII - 1, -1, -1):
    row = ""
    for gx in range(VERT_ASCII):
        sx = min(VERT_GRID - 1, int((gx + 0.5) / VERT_ASCII * VERT_GRID))
        sy = min(VERT_GRID - 1, int((gy + 0.5) / VERT_ASCII * VERT_GRID))
        row += "#" if vertex_occ[sy, sx] else "."
    vert_map += row + "\n"

print(json.dumps({
    "path": str(PATH),
    "triangles": int(len(indices)),
    "bounds": {"min": lo.tolist(), "max": hi.tolist(), "size": size.tolist()},
    "innerFootprintCoveredRatio": float(inner.mean()),
    "centralFootprintCoveredRatio": float(central.mean()),
    "centerSampleCovered": bool(covered[SAMPLE // 2, SAMPLE // 2]),
    "centerSampleHits": int(hit_count[SAMPLE // 2, SAMPLE // 2]),
    "centerDepth": None if not covered[SAMPLE // 2, SAMPLE // 2] else [float(depth_min[SAMPLE // 2, SAMPLE // 2]), float(depth_max[SAMPLE // 2, SAMPLE // 2])],
    "vertexOpeningRectNormalized": opening_norm,
    "vertexOpeningPixel": {"x": int(bx), "y": int(by), "w": int(bw), "h": int(bh)},
    "vertexOccupancyAscii": vert_map,
}, indent=2))
