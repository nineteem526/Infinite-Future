// Offline optimizer for ART-003 energy crystal (not part of the app bundle).
// Reads the original ~1.98M-triangle / 49.7MB GLB, decimates with the locally
// installed meshoptimizer package, computes flat facet normals, downscales both
// 8K JPEG textures to 1K with Pillow, and writes a small game GLB.
//
// Usage:
//   node src/dev/art003_optimize.mjs --build --out public/assets/art003-energy-crystal-game.glb
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(path) {
  const raw = readFileSync(path);
  if (raw.readUInt32LE(0) !== GLB_MAGIC || raw.readUInt32LE(4) !== 2) {
    throw new Error('not a glTF 2.0 binary');
  }
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
  if (!json) throw new Error('missing JSON chunk');
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
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(doc, bin, index) {
  const accessor = doc.accessors[index];
  const view = doc.bufferViews[accessor.bufferView];
  const comp = COMPONENT[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  const stride = view.byteStride ?? comp.bytes * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new comp.kind(accessor.count * components);
  for (let i = 0; i < accessor.count; i += 1) {
    const start = base + i * stride;
    for (let c = 0; c < components; c += 1) {
      out[i * components + c] = comp.read(bin, start + c * comp.bytes);
    }
  }
  return out;
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

async function build(inPath, outPath) {
  await MeshoptSimplifier.ready;
  const { json, bin } = parseGlb(inPath);
  const sceneIndex = json.scene ?? 0;
  let meshNodeIndex = null;
  const visit = (index) => {
    const node = json.nodes[index];
    if (meshNodeIndex === null && node.mesh !== undefined) meshNodeIndex = index;
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of json.scenes?.[sceneIndex]?.nodes ?? []) visit(root);
  if (meshNodeIndex === null) throw new Error('no mesh node');
  const primitive = json.meshes[json.nodes[meshNodeIndex].mesh].primitives[0];
  const attributeSet = Object.keys(primitive.attributes);
  if (!attributeSet.includes('POSITION') || !attributeSet.includes('TEXCOORD_0')) {
    throw new Error(`unexpected attributes: ${attributeSet.join(',')}`);
  }

  const positions = readAccessor(json, bin, primitive.attributes.POSITION);
  const uvs = readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
  const sourceIndices = new Uint32Array(readAccessor(json, bin, primitive.indices));
  const sourceTriangles = sourceIndices.length / 3;
  console.log(`source: vertices=${positions.length / 3} triangles=${sourceTriangles}`);

  const targetTriangles = 22000;
  const [simplified] = MeshoptSimplifier.simplify(
    sourceIndices,
    positions,
    3,
    targetTriangles * 3,
    1e-2,
    ['Permissive'],
  );

  // Expand to per-triangle vertices with flat facet normals (crystal look) while
  // preserving the UVs from the simplified source vertices.
  const outPositions = new Float32Array(simplified.length * 3);
  const outUvs = new Float32Array(simplified.length * 2);
  const outNormals = new Float32Array(simplified.length * 3);
  for (let i = 0; i < simplified.length; i += 3) {
    const ia = simplified[i];
    const ib = simplified[i + 1];
    const ic = simplified[i + 2];
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cy = positions[ic * 3 + 1];
    const cz = positions[ic * 3 + 2];
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const [nx, ny, nz] = normalize3(
      e1y * e2z - e1z * e2y,
      e1z * e2x - e1x * e2z,
      e1x * e2y - e1y * e2x,
    );
    for (let c = 0; c < 3; c += 1) {
      const source = [ia, ib, ic][c];
      const target = i + c;
      outPositions[target * 3] = positions[source * 3];
      outPositions[target * 3 + 1] = positions[source * 3 + 1];
      outPositions[target * 3 + 2] = positions[source * 3 + 2];
      outUvs[target * 2] = uvs[source * 2];
      outUvs[target * 2 + 1] = uvs[source * 2 + 1];
      outNormals[target * 3] = nx;
      outNormals[target * 3 + 1] = ny;
      outNormals[target * 3 + 2] = nz;
    }
  }
  console.log(`optimized: vertices=${outPositions.length / 3} triangles=${outPositions.length / 9}`);

  const tempDir = mkdtempSync(join(tmpdir(), 'art003-'));
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
    print(f'{src.split(chr(47))[-1]} -> {image.size[0]}x{image.size[1]}')
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
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < outPositions.length; i += 3) {
      for (let c = 0; c < 3; c += 1) {
        min[c] = Math.min(min[c], outPositions[i + c]);
        max[c] = Math.max(max[c], outPositions[i + c]);
      }
    }
    accessors.push({
      bufferView: addView(Buffer.from(outPositions.buffer), 34962),
      componentType: 5126,
      count: outPositions.length / 3,
      type: 'VEC3',
      min,
      max,
    });
    accessors.push({
      bufferView: addView(Buffer.from(outNormals.buffer), 34962),
      componentType: 5126,
      count: outNormals.length / 3,
      type: 'VEC3',
    });
    accessors.push({
      bufferView: addView(Buffer.from(outUvs.buffer), 34962),
      componentType: 5126,
      count: outUvs.length / 2,
      type: 'VEC2',
    });
    const imageViews = textures.map(({ bytes }) => addView(bytes));
    const sourceMaterial = json.materials?.[0]?.pbrMetallicRoughness ?? {};
    const gltf = {
      asset: {
        version: '2.0',
        generator: 'Infinite Future offline optimizer: meshoptimizer 1.1.1 + Pillow',
      },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'EnergyCrystal', mesh: 0 }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
          material: 0,
          mode: 4,
        }],
      }],
      materials: [{
        name: 'energy-crystal',
        doubleSided: false,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicRoughnessTexture: textures.length > 1 ? { index: 1 } : undefined,
          metallicFactor: Math.min(1, sourceMaterial.metallicFactor ?? 0.25),
          roughnessFactor: Math.min(1, sourceMaterial.roughnessFactor ?? 0.45),
        },
        emissiveFactor: [0.04, 0.1, 0.12],
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
    out.writeUInt32LE(GLB_MAGIC, 0);
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jsonBuffer.length, 12);
    out.writeUInt32LE(CHUNK_JSON, 16);
    jsonBuffer.copy(out, 20);
    const header2 = 20 + jsonBuffer.length;
    out.writeUInt32LE(binBuffer.length, header2);
    out.writeUInt32LE(CHUNK_BIN, header2 + 4);
    binBuffer.copy(out, header2 + 8);
    writeFileSync(outPath, out);
    console.log(JSON.stringify({
      outPath,
      bytes: out.length,
      triangles: outPositions.length / 9,
      vertices: outPositions.length / 3,
      textures: textures.map(({ name, bytes }) => ({ name, bytes: bytes.length })),
      bounds: { min, max },
    }, null, 2));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
const inPath = 'art-pipeline/generated/originals/ART-003-energy-crystal-v1.glb';
if (args.includes('--build')) {
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : 'public/assets/art003-energy-crystal-game.glb';
  await build(inPath, outPath);
} else {
  console.error('use: node src/dev/art003_optimize.mjs --build --out <path>');
  process.exit(1);
}
