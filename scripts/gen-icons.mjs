// Generates the PWA / favicon icons.
//
//   Company logo mark (white mark on a brand gradient):
//     node scripts/gen-icons.mjs --mark public/brand/jnt-mark.svg --from "#E4470C" --to "#F29A1A"
//     add --keep-colors to keep the mark's own colours on a white background.
//     add --small-mark <file> to use a simpler/taller mark for favicon sizes (<= 64 px),
//     e.g. public/brand/jnt-monogram.svg — a 4:1 wordmark is unreadable at 16 px.
//     The mark must have a transparent background (SVG, or PNG with alpha).
//
//   Generic map-pin icon (no logo):
//     node scripts/gen-icons.mjs --pin "#b91c1c"
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const hex = (opt("--pin") || "#b91c1c").replace("#", "");
const BRAND = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
const WHITE = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Returns [r,g,b,a] for a point in unit space.
function shade(x, y, { maskable }) {
  const s = maskable ? 0.78 : 1;
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  if (!maskable) {
    const r = 0.2;
    const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }
  const cx = 0.5, cy = 0.42, R = 0.21;
  const d = Math.hypot(u - cx, v - cy);
  const tipY = 0.8;
  let inPin = d <= R;
  if (!inPin && v > cy && v <= tipY) {
    const half = R * ((tipY - v) / (tipY - cy)) * 1.05;
    inPin = Math.abs(u - cx) <= half && v >= cy + R * 0.3;
  }
  const inHole = d <= 0.085;
  const ground = Math.abs(v - 0.84) < 0.018 && Math.abs(u - 0.5) < 0.2;
  if ((inPin && !inHole) || ground) return [...WHITE, 255];
  return [...BRAND, 255];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (py * size + px) * 4;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round(a / (SS * SS));
    }
  }
  return encodePng(size, buf);
}

// ---------------------------------------------------------------- logo mark mode (uses sharp)

async function renderMark(markFile, size, { maskable, from, to, keepColors }) {
  const { default: sharp } = await import("sharp");
  // Maskable icons get cropped to a circle (safe zone = 80 % diameter), so keep the mark smaller.
  const small = size <= 64;
  const widthShare = maskable ? 0.72 : small ? 0.9 : 0.82;
  const heightShare = small ? 0.72 : 0.6;
  let mark = await sharp(markFile, { density: 600 })
    .resize({ width: Math.round(size * widthShare), height: Math.round(size * heightShare), fit: "inside" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const meta = await sharp(mark).metadata();
  if (!keepColors) {
    const alpha = await sharp(mark).extractChannel("alpha").png().toBuffer();
    mark = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: "#ffffff" } })
      .joinChannel(alpha)
      .png()
      .toBuffer();
  }
  // Full-bleed squares for maskable/Apple icons (the OS rounds them); rounded otherwise.
  const rx = maskable ? 0 : Math.round(size * 0.2);
  const bg = keepColors
    ? `<rect width="${size}" height="${size}" rx="${rx}" fill="#ffffff"/>`
    : `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${rx}" fill="url(#g)"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg}</svg>`))
    .composite([{ input: mark, top: Math.round((size - meta.height) / 2), left: Math.round((size - meta.width) / 2) }])
    .png()
    .toBuffer();
}

const root = process.cwd();
const out = [
  ["public/icons/icon-192.png", 192, { maskable: false }],
  ["public/icons/icon-512.png", 512, { maskable: false }],
  ["public/icons/icon-maskable-512.png", 512, { maskable: true }],
  ["src/app/icon.png", 64, { maskable: false }],
  ["src/app/apple-icon.png", 180, { maskable: true }],
];

// Windows .ico with embedded PNGs (supported by all current browsers).
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

const markFile = opt("--mark");
const smallMarkFile = opt("--small-mark") || markFile;
const settings = {
  from: opt("--from") || "#E4470C",
  to: opt("--to") || "#F29A1A",
  keepColors: argv.includes("--keep-colors"),
};
for (const [file, size, opts] of out) {
  const abs = path.join(root, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, await iconPng(size, opts));
  console.log("wrote", file);
}

async function iconPng(size, opts) {
  if (!markFile) return render(size, opts);
  const file = size <= 64 && !opts.maskable ? smallMarkFile : markFile;
  return renderMark(path.resolve(root, file), size, { ...opts, ...settings });
}

// Browser-tab favicon with real 16/32/48 px images instead of a downscaled 64 px one.
const ico = [];
for (const size of [16, 32, 48]) ico.push({ size, png: await iconPng(size, { maskable: false }) });
fs.writeFileSync(path.join(root, "src/app/favicon.ico"), encodeIco(ico));
console.log("wrote src/app/favicon.ico");
