// Offline optimizer for ART-002 gallery frame (not part of the app bundle).
// Original: ~1.97M tris / 51MB / 2x8K JPEG. Output: ~20k tris with 1K textures,
// smooth normals, using the locally installed meshoptimizer + Pillow.
//
// Usage: node src/dev/art002_frame_optimize.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const IN = 'art-pipeline/generated/originals/ART-002-gallery-frame-v1.glb';
const OUT = 'public/assets/art002-gallery-frame-game.glb';
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(path) {
  const raw = readFileSync(path);
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset < raw.length) {
    const length = raw.readUInt32LE(offset);
    const type = raw.readUInt32LE(offset + 4);
    const body = raw.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    if (type === CHUNK_BIN) bin = body;
    offset += 8 + length;
  }
  return { json, bin };
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
function readAccessor(json, bin, index) {
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
function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

await MeshoptSimplifier.ready;
const { json, bin } = parseGlb(IN);
const meshNode = json.nodes.find((node) => node.mesh !== undefined);
const primitive = json.meshes[meshNode.mesh].primitives[0];
const positions = readAccessor(json, bin, primitive.attributes.POSITION);
const uvs = readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
const sourceIndices = new Uint32Array(readAccessor(json, bin, primitive.indices));
console.log(`source: vertices=${positions.length / 3} triangles=${sourceIndices.length / 3}`);

const TARGET_TRIANGLES = 20000;
const [simplified] = MeshoptSimplifier.simplify(
  sourceIndices,
  positions,
  3,
  TARGET_TRIANGLES * 3,
  1e-2,
  ['Permissive'],
);
console.log(`simplified: triangles=${simplified.length / 3}`);

const remap = new Map();
const outPositions = [];
const outUvs = [];
const newIndices = new Uint32Array(simplified.length);
for (let i = 0; i < simplified.length; i += 1) {
  const old = simplified[i];
  let mapped = remap.get(old);
  if (mapped === undefined) {
    mapped = remap.size;
    remap.set(old, mapped);
    outPositions.push(positions[old * 3], positions[old * 3 + 1], positions[old * 3 + 2]);
    outUvs.push(uvs[old * 2], uvs[old * 2 + 1]);
  }
  newIndices[i] = mapped;
}
const vertexCount = remap.size;
const outNormals = new Float32Array(vertexCount * 3);
for (let i = 0; i < simplified.length; i += 3) {
  const ia = newIndices[i];
  const ib = newIndices[i + 1];
  const ic = newIndices[i + 2];
  const ax = outPositions[ia * 3];
  const ay = outPositions[ia * 3 + 1];
  const az = outPositions[ia * 3 + 2];
  const bx = outPositions[ib * 3];
  const by = outPositions[ib * 3 + 1];
  const bz = outPositions[ib * 3 + 2];
  const cx = outPositions[ic * 3];
  const cy = outPositions[ic * 3 + 1];
  const cz = outPositions[ic * 3 + 2];
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  for (const index of [ia, ib, ic]) {
    outNormals[index * 3] += nx;
    outNormals[index * 3 + 1] += ny;
    outNormals[index * 3 + 2] += nz;
  }
}
for (let i = 0; i < vertexCount; i += 1) {
  const [nx, ny, nz] = normalize3(outNormals[i * 3], outNormals[i * 3 + 1], outNormals[i * 3 + 2]);
  outNormals[i * 3] = nx;
  outNormals[i * 3 + 1] = ny;
  outNormals[i * 3 + 2] = nz;
}
console.log(`compacted vertices=${vertexCount}`);

const tempDir = mkdtempSync(join(tmpdir(), 'art002-'));
try {
  const imageMeta = (json.images ?? []).map((image, index) => {
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const inPath = join(tempDir, `source-${index}.jpg`);
    const outPath = join(tempDir, `scaled-${index}.jpg`);
    writeFileSync(inPath, bytes);
    return { inPath, outPath, name: image.name };
  });
  const pyPath = join(tempDir, 'scale.py');
  writeFileSync(pyPath, `
import sys
from PIL import Image
for pair in sys.argv[1:]:
    src, dst = pair.split('|')
    image = Image.open(src).convert('RGB')
    width, height = image.size
    scale = 1024 / max(width, height)
    if scale < 1:
        image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
    image.save(dst, 'JPEG', quality=84, optimize=True)
    print(f'{width}x{height} -> {image.size[0]}x{image.size[1]}')
`);
  const resize = spawnSync(
    'python',
    [pyPath, ...imageMeta.map(({ inPath, outPath }) => `${inPath}|${outPath}`)],
    { encoding: 'utf8' },
  );
  if (resize.status !== 0) throw new Error(resize.stderr || resize.stdout);
  console.log(resize.stdout.trim());
  const textures = imageMeta.map(({ outPath, name }) => ({ name, bytes: readFileSync(outPath) }));

  const bufferViews = [];
  const chunks = [];
  const accessors = [];
  const addView = (buffer, target) => {
    bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: buffer.length, ...(target ? { target } : {}) });
    chunks.push(buffer);
    return bufferViews.length - 1;
  };
  const pad4 = (buffer) => {
    const pad = (4 - (buffer.length % 4)) % 4;
    return pad === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(pad)]);
  };
  const padJson = (buffer) => {
    const pad = (4 - (buffer.length % 4)) % 4;
    return pad === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(pad, 0x20)]);
  };
  const positionBuffer = Buffer.from(new Float32Array(outPositions).buffer);
  const normalBuffer = Buffer.from(new Float32Array(outNormals).buffer);
  const uvBuffer = Buffer.from(new Float32Array(outUvs).buffer);
  const indexBuffer = Buffer.from(new Uint32Array(newIndices).buffer);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < outPositions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], outPositions[i + c]);
      max[c] = Math.max(max[c], outPositions[i + c]);
    }
  }
  accessors.push({
    bufferView: addView(positionBuffer, 34962),
    componentType: 5126,
    count: vertexCount,
    type: 'VEC3',
    min,
    max,
  });
  accessors.push({
    bufferView: addView(normalBuffer, 34962),
    componentType: 5126,
    count: vertexCount,
    type: 'VEC3',
  });
  accessors.push({
    bufferView: addView(uvBuffer, 34962),
    componentType: 5126,
    count: vertexCount,
    type: 'VEC2',
  });
  accessors.push({
    bufferView: addView(indexBuffer, 34963),
    componentType: 5125,
    count: newIndices.length,
    type: 'SCALAR',
  });
  const imageViews = textures.map(({ bytes }) => addView(bytes));
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Infinite Future offline optimizer: meshoptimizer 1.1.1 + Pillow',
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'GalleryFrame', mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      name: 'gallery-frame',
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: textures.length > 1 ? { index: 1 } : undefined,
        metallicFactor: Math.min(1, json.materials?.[0]?.pbrMetallicRoughness?.metallicFactor ?? 0.8),
        roughnessFactor: Math.min(1, json.materials?.[0]?.pbrMetallicRoughness?.roughnessFactor ?? 0.55),
      },
    }],
    textures: textures.map((_, index) => ({ sampler: 0, source: index })),
    images: imageViews.map((bufferView, index) => ({
      name: textures[index].name ?? `texture-${index}`,
      mimeType: 'image/jpeg',
      bufferView,
    })),
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  const paddedChunks = [];
  let binLength = 0;
  for (let i = 0; i < bufferViews.length; i += 1) {
    const padded = pad4(chunks[i]);
    bufferViews[i].byteOffset = binLength;
    bufferViews[i].byteLength = chunks[i].length;
    paddedChunks.push(padded);
    binLength += padded.length;
  }
  const binBuffer = Buffer.concat(paddedChunks);
  gltf.buffers[0].byteLength = binBuffer.length;
  const jsonBuffer = padJson(Buffer.from(JSON.stringify(gltf), 'utf8'));
  const total = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuffer.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBuffer.copy(out, 20);
  const header2 = 20 + jsonBuffer.length;
  out.writeUInt32LE(binBuffer.length, header2);
  out.writeUInt32LE(CHUNK_BIN, header2 + 4);
  binBuffer.copy(out, header2 + 8);
  writeFileSync(OUT, out);
  console.log(JSON.stringify({
    out: OUT,
    bytes: out.length,
    triangles: newIndices.length / 3,
    vertices: vertexCount,
    textures: textures.map(({ bytes }) => bytes.length),
    bounds: { min, max },
  }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
