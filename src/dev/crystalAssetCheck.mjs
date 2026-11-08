/**
 * Structural check for the optimized ART-003 game copy. This does not render in
 * a browser; it validates the GLB the app loads (size, triangle budget, texture
 * resolution, accessors, outward normals) and confirms the source is preserved.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const GAME = 'public/assets/art003-energy-crystal-game.glb';
const SOURCE = 'art-pipeline/generated/originals/ART-003-energy-crystal-v1.glb';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
function ok(message) {
  console.log(`PASS: ${message}`);
}

function parseGlb(path) {
  const raw = readFileSync(path);
  if (raw.readUInt32LE(0) !== 0x46546c67 || raw.readUInt32LE(4) !== 2) fail('invalid GLB header');
  if (raw.readUInt32LE(8) !== raw.length) fail('GLB declared length mismatch');
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
  if (!json) fail('missing JSON chunk');
  return { raw, json, bin };
}
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index < bytes.length - 8) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(index);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(index + 3), width: bytes.readUInt16BE(index + 5) };
    }
    index += length;
  }
  return null;
}
function accessor(doc, bin, index) {
  const a = doc.accessors[index];
  const v = doc.bufferViews[a.bufferView];
  if (a.componentType !== 5126) fail(`accessor ${index} is not float`);
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const stride = v.byteStride ?? components * 4;
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = new Float32Array(a.count * components);
  for (let i = 0; i < a.count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      out[i * components + c] = bin.readFloatLE(base + i * stride + c * 4);
    }
  }
  return out;
}

if (!existsSync(GAME)) fail(`${GAME} missing`);
if (!existsSync(SOURCE)) fail('original ART-003 source missing (must be preserved)');
const sourceBytes = readFileSync(SOURCE).length;
ok(`original source preserved (${sourceBytes} bytes)`);

const { raw, json, bin } = parseGlb(GAME);
ok(`valid GLB v2 (${raw.length} bytes)`);
if (raw.length > 5 * 1024 * 1024) fail('game GLB exceeds 5MB budget');

const primitive = json.meshes?.[0]?.primitives?.[0];
if (!primitive) fail('no mesh primitive');
const attributes = primitive.attributes ?? {};
if (attributes.POSITION === undefined || attributes.NORMAL === undefined || attributes.TEXCOORD_0 === undefined) {
  fail('expected POSITION, NORMAL and TEXCOORD_0');
}
const positions = accessor(json, bin, attributes.POSITION);
const normals = accessor(json, bin, attributes.NORMAL);
const uvs = accessor(json, bin, attributes.TEXCOORD_0);
const triangles = positions.length / 9;
if (triangles < 8000 || triangles > 30000) fail(`triangle budget mismatch: ${triangles}`);
ok(`triangle budget: ${triangles} triangles (8k-30k)`);
ok(`vertex count: ${positions.length / 3}`);

let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let c = 0; c < 3; c += 1) {
    min[c] = Math.min(min[c], positions[i + c]);
    max[c] = Math.max(max[c], positions[i + c]);
  }
}
const extent = max.map((value, index) => value - min[index]);
if (Math.abs(extent[1] - 1) > 0.01) fail(`height extent drifted: ${extent[1]}`);
ok(`bounds extent ${extent.map((value) => value.toFixed(3)).join(' x ')} (source-like proportions)`);

let outward = 0;
for (let i = 0; i < positions.length; i += 9) {
  const cx = (positions[i] + positions[i + 3] + positions[i + 6]) / 3;
  const cy = (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3;
  const cz = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3;
  const nx = normals[i];
  const ny = normals[i + 1];
  const nz = normals[i + 2];
  if (cx * nx + cy * ny + cz * nz >= 0) outward += 1;
}
const ratio = outward / (triangles);
if (ratio < 0.6) fail(`normals may face inward (outward ratio ${ratio.toFixed(2)})`);
ok(`facet normals mostly outward (${(ratio * 100).toFixed(1)}%)`);

const images = json.images ?? [];
if (images.length !== 2) fail(`expected 2 textures, found ${images.length}`);
for (const image of images) {
  const view = json.bufferViews[image.bufferView];
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const size = jpegSize(bytes);
  if (!size) fail('texture is not a readable JPEG');
  if (size.width > 2048 || size.height > 2048) fail(`texture too large: ${size.width}x${size.height}`);
  ok(`texture ${size.width}x${size.height} JPEG (${bytes.length} bytes)`);
}
ok(`optimized GLB validation complete: ${GAME}`);

// --- KEY-001 lightweight Chrono Key -------------------------------------------------
const KEY_GAME = 'public/assets/chrono-key-game.glb';
const KEY_SOURCE = 'hi3d-Chrono Key_2.glb';
if (!existsSync(KEY_GAME)) fail(`${KEY_GAME} missing`);
if (!existsSync(KEY_SOURCE)) fail('original Chrono Key source missing (must be preserved)');
const keyGameBytes = readFileSync(KEY_GAME);
const keySourceBytes = readFileSync(KEY_SOURCE);
if (keySourceBytes.length !== 1567668) fail(`unexpected source size: ${keySourceBytes.length}`);
if (!keyGameBytes.equals(keySourceBytes)) fail('game copy must be the exact existing lightweight key file');
ok(`Chrono Key source preserved and copied exactly (${keySourceBytes.length} bytes)`);
const keyParsed = parseGlb(KEY_GAME);
const keyPrimitive = keyParsed.json.meshes?.[0]?.primitives?.[0];
if (!keyPrimitive) fail('Chrono Key has no mesh primitive');
const keyIndexCount = keyParsed.json.accessors[keyPrimitive.indices]?.count ?? 0;
const keyTriangles = keyIndexCount / 3;
if (keyTriangles < 8000 || keyTriangles > 20000) fail(`Chrono Key triangle budget mismatch: ${keyTriangles}`);
ok(`Chrono Key triangle count: ${keyTriangles}`);
const keyImages = keyParsed.json.images ?? [];
if (keyImages.length !== 3) fail(`expected 3 Chrono Key textures, found ${keyImages.length}`);
for (const image of keyImages) {
  const view = keyParsed.json.bufferViews[image.bufferView];
  const bytes = keyParsed.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  if (bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') fail('Chrono Key texture is not PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width > 2048 || height > 2048) fail(`Chrono Key texture too large: ${width}x${height}`);
  ok(`Chrono Key texture ${width}x${height} PNG`);
}
if (keyGameBytes.length > 3 * 1024 * 1024) fail('Chrono Key game copy exceeds 3MB');
ok(`Chrono Key validation complete: ${KEY_GAME}`);

// --- ART-002 lightweight gallery frame ---------------------------------------------
const FRAME_GAME = 'public/assets/art002-gallery-frame-game.glb';
const FRAME_SOURCE = 'art-pipeline/generated/originals/ART-002-gallery-frame-v1.glb';
if (!existsSync(FRAME_GAME)) fail(`${FRAME_GAME} missing`);
if (!existsSync(FRAME_SOURCE)) fail('original ART-002 frame source missing (must be preserved)');
const frameSourceBytes = readFileSync(FRAME_SOURCE);
if (frameSourceBytes.length !== 51022384) fail(`unexpected frame source size: ${frameSourceBytes.length}`);
ok(`gallery frame source preserved (${frameSourceBytes.length} bytes)`);
const frameRaw = readFileSync(FRAME_GAME);
const frameParsed = parseGlb(FRAME_GAME);
const framePrimitive = frameParsed.json.meshes?.[0]?.primitives?.[0];
if (!framePrimitive) fail('gallery frame has no mesh primitive');
const frameIndexCount = frameParsed.json.accessors[framePrimitive.indices]?.count ?? 0;
const frameTriangles = frameIndexCount / 3;
if (frameTriangles < 8000 || frameTriangles > 30000) fail(`gallery frame triangle budget mismatch: ${frameTriangles}`);
ok(`gallery frame triangle count: ${frameTriangles}`);
const frameImages = frameParsed.json.images ?? [];
if (frameImages.length !== 2) fail(`expected 2 gallery frame textures, found ${frameImages.length}`);
for (const image of frameImages) {
  const view = frameParsed.json.bufferViews[image.bufferView];
  const bytes = frameParsed.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const size = jpegSize(bytes);
  if (!size) fail('gallery frame texture is not readable JPEG');
  if (size.width > 2048 || size.height > 2048) fail(`gallery frame texture too large: ${size.width}x${size.height}`);
  ok(`gallery frame texture ${size.width}x${size.height} JPEG`);
}
if (frameRaw.length > 3 * 1024 * 1024) fail('gallery frame game copy exceeds 3MB');
const frameAttrs = framePrimitive.attributes ?? {};
if (frameAttrs.POSITION === undefined || frameAttrs.NORMAL === undefined || frameAttrs.TEXCOORD_0 === undefined) {
  fail('gallery frame game copy lacks POSITION/NORMAL/TEXCOORD_0');
}
ok(`gallery frame validation complete: ${FRAME_GAME}`);

// --- Temporary gallery painting textures ------------------------------------------
const ART_SOURCES = [
  ['art-pipeline/暮色钟城广场.png', 2787905],
  ['art-pipeline/末日钟塔广场的黄昏废墟.png', 2935638],
];
for (const [source, expectedBytes] of ART_SOURCES) {
  if (!existsSync(source)) fail(`gallery art source missing: ${source}`);
  if (readFileSync(source).length !== expectedBytes) fail(`gallery art source changed: ${source}`);
}
ok('gallery art source PNGs preserved');
const ART_GAME = ['public/assets/gallery-art-2026.jpg', 'public/assets/gallery-art-2126.jpg'];
const canvasAspect = 3.4 / 2.2;
for (const path of ART_GAME) {
  if (!existsSync(path)) fail(`${path} missing`);
  const bytes = readFileSync(path);
  if (bytes.length > 1024 * 1024) fail(`${path} exceeds 1MB`);
  const size = jpegSize(bytes);
  if (!size) fail(`${path} is not a readable JPEG`);
  if (Math.abs(size.width / size.height - canvasAspect) > 0.01) {
    fail(`${path} aspect ${size.width / size.height} does not match canvas ${canvasAspect}`);
  }
  ok(`gallery artwork ${size.width}x${size.height} JPEG (${bytes.length} bytes, canvas aspect)`);
}



