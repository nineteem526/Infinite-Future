// Offline inspection for ART-002 gallery frame: structure + central-opening test.
// Read-only; does not modify the original.
import { readFileSync } from 'node:fs';

const path = 'art-pipeline/generated/originals/ART-002-gallery-frame-v1.glb';
const raw = readFileSync(path);
let offset = 12;
let json = null;
let bin = Buffer.alloc(0);
while (offset < raw.length) {
  const length = raw.readUInt32LE(offset);
  const type = raw.readUInt32LE(offset + 4);
  const body = raw.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
  if (type === 0x004e4942) bin = body;
  offset += 8 + length;
}
const COMPONENT = {
  5120: { bytes: 1, read: (b, o) => b.readInt8(o), kind: Int8Array },
  5121: { bytes: 1, read: (b, o) => b.readUInt8(o), kind: Uint8Array },
  5122: { bytes: 2, read: (b, o) => b.readInt16LE(o), kind: Int16Array },
  5123: { bytes: 2, read: (b, o) => b.readUInt16LE(o), kind: Uint16Array },
  5125: { bytes: 4, read: (b, o) => b.readUInt32LE(o), kind: Uint32Array },
  5126: { bytes: 4, read: (b, o) => b.readFloatLE(o), kind: Float32Array },
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const comp = COMPONENT[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  const stride = view.byteStride ?? comp.bytes * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new comp.kind(accessor.count * components);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      out[i * components + c] = comp.read(bin, base + i * stride + c * comp.bytes);
    }
  }
  return out;
}
const meshNode = json.nodes.find((node) => node.mesh !== undefined);
const primitive = json.meshes[meshNode.mesh].primitives[0];
const positions = readAccessor(primitive.attributes.POSITION);
const indices = readAccessor(primitive.indices);
const vertexCount = positions.length / 3;
const triangles = indices.length / 3;
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let c = 0; c < 3; c += 1) {
    min[c] = Math.min(min[c], positions[i + c]);
    max[c] = Math.max(max[c], positions[i + c]);
  }
}
const size = max.map((v, i) => v - min[i]);
const grid = 96;
const occupancy = new Uint16Array(grid * grid);
const centerDepth = [];
for (let t = 0; t < indices.length; t += 3) {
  const ia = indices[t];
  const ib = indices[t + 1];
  const ic = indices[t + 2];
  const cx = (positions[ia * 3] + positions[ib * 3] + positions[ic * 3]) / 3;
  const cy = (positions[ia * 3 + 1] + positions[ib * 3 + 1] + positions[ic * 3 + 1]) / 3;
  const cz = (positions[ia * 3 + 2] + positions[ib * 3 + 2] + positions[ic * 3 + 2]) / 3;
  const nx = (cx - min[0]) / size[0];
  const ny = (cy - min[1]) / size[1];
  const gx = Math.min(grid - 1, Math.max(0, Math.floor(nx * grid)));
  const gy = Math.min(grid - 1, Math.max(0, Math.floor(ny * grid)));
  occupancy[gy * grid + gx] += 1;
  if (nx > 0.25 && nx < 0.75 && ny > 0.2 && ny < 0.8) centerDepth.push(cz);
}
let centerCells = 0;
let centerCovered = 0;
for (let gy = 0; gy < grid; gy += 1) {
  for (let gx = 0; gx < grid; gx += 1) {
    const nx = (gx + 0.5) / grid;
    const ny = (gy + 0.5) / grid;
    if (nx > 0.25 && nx < 0.75 && ny > 0.2 && ny < 0.8) {
      centerCells += 1;
      if (occupancy[gy * grid + gx] > 0) centerCovered += 1;
    }
  }
}
// column/row occupancy summaries for the central band
const columnCoverage = [];
for (let gx = 0; gx < grid; gx += 1) {
  let count = 0;
  for (let gy = 0; gy < grid; gy += 1) if (occupancy[gy * grid + gx] > 0) count += 1;
  columnCoverage.push(count);
}
let centerDepthMin = Infinity;
let centerDepthMax = -Infinity;
for (const z of centerDepth) {
  centerDepthMin = Math.min(centerDepthMin, z);
  centerDepthMax = Math.max(centerDepthMax, z);
}
// Inner-central rectangle (half size 0.22x0.25) occupancy and depth histogram.
const innerMinX = -0.22;
const innerMaxX = 0.22;
const innerMinY = -0.25;
const innerMaxY = 0.25;
let innerCells = 0;
let innerCovered = 0;
const innerDepth = [];
for (let gy = 0; gy < grid; gy += 1) {
  for (let gx = 0; gx < grid; gx += 1) {
    const nx = (gx + 0.5) / grid;
    const ny = (gy + 0.5) / grid;
    const wx = min[0] + nx * size[0];
    const wy = min[1] + ny * size[1];
    if (wx > innerMinX && wx < innerMaxX && wy > innerMinY && wy < innerMaxY) {
      innerCells += 1;
      const count = occupancy[gy * grid + gx];
      if (count > 0) innerCovered += 1;
    }
  }
}
for (let t = 0; t < indices.length; t += 3) {
  const ia = indices[t];
  const ib = indices[t + 1];
  const ic = indices[t + 2];
  const cx = (positions[ia * 3] + positions[ib * 3] + positions[ic * 3]) / 3;
  const cy = (positions[ia * 3 + 1] + positions[ib * 3 + 1] + positions[ic * 3 + 1]) / 3;
  const cz = (positions[ia * 3 + 2] + positions[ib * 3 + 2] + positions[ic * 3 + 2]) / 3;
  if (cx > innerMinX && cx < innerMaxX && cy > innerMinY && cy < innerMaxY) innerDepth.push(cz);
}
const zBucketCount = 20;
const zMin = min[2];
const zMax = max[2];
const zHistogram = new Array(zBucketCount).fill(0);
for (const z of innerDepth) {
  const bucket = Math.min(zBucketCount - 1, Math.max(0, Math.floor(((z - zMin) / (zMax - zMin)) * zBucketCount)));
  zHistogram[bucket] += 1;
}
const ASCII_SIZE = 40;
let ascii = '';
for (let gy = ASCII_SIZE - 1; gy >= 0; gy -= 1) {
  let line = '';
  for (let gx = 0; gx < ASCII_SIZE; gx += 1) {
    const sx = Math.min(grid - 1, Math.floor((gx / ASCII_SIZE) * grid));
    const sy = Math.min(grid - 1, Math.floor((gy / ASCII_SIZE) * grid));
    line += occupancy[sy * grid + sx] > 0 ? '#' : '.';
  }
  ascii += `${line}\n`;
}
console.log(JSON.stringify({
  file: path,
  bytes: raw.length,
  nodes: json.nodes,
  attributes: Object.keys(primitive.attributes),
  primitive,
  material: json.materials,
  images: json.images?.map((image) => {
    const view = json.bufferViews[image.bufferView];
    return { mimeType: image.mimeType, bytes: view.byteLength };
  }),
  textures: json.textures,
  triangles,
  vertices: vertexCount,
  bounds: { min, max, size },
  centralFootprintCoveredRatio: centerCovered / centerCells,
  innerCentralFootprintCoveredRatio: innerCovered / innerCells,
  innerCentralTriangleCount: innerDepth.length,
  innerDepthRange: innerDepth.length ? [Math.min(...innerDepth.slice(0, 50000)), Math.max(...innerDepth.slice(0, 50000))] : null,
  zHistogram,
  zRange: [zMin, zMax],
  occupancyAscii: ascii,
  columnCoverage,
}, null, 2));
