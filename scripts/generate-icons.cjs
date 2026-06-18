/**
 * Generates placeholder PWA icons (real PNGs) without any image dependencies.
 * Draws a brand-dark rounded tile with a white circle mark + accent ring.
 * Replace these with your own brand icons anytime (same filenames in /public).
 *
 * Run: node scripts/generate-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [15, 20, 32]; // #0f1420
const WHITE = [255, 255, 255];
const ACCENT = [226, 59, 46]; // #e23b2e

function hex(c) {
  return c;
}

function makePng(size) {
  const w = size, h = size;
  const buf = Buffer.alloc(w * h * 4);
  const cx = w / 2, cy = h / 2;
  const rOuter = size * 0.30; // accent ring radius
  const rInner = size * 0.22; // white circle radius
  const corner = size * 0.22;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Rounded-rect background mask.
      const inCorner =
        (x < corner && y < corner && dist(x, y, corner, corner) > corner) ||
        (x > w - corner && y < corner && dist(x, y, w - corner, corner) > corner) ||
        (x < corner && y > h - corner && dist(x, y, corner, h - corner) > corner) ||
        (x > w - corner && y > h - corner && dist(x, y, w - corner, h - corner) > corner);
      let color = BG;
      let alpha = 255;
      if (inCorner) {
        alpha = 0;
      } else {
        const d = dist(x, y, cx, cy);
        if (d <= rInner) color = WHITE;
        else if (d <= rOuter) color = ACCENT;
        else color = BG;
      }
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = alpha;
    }
  }
  return encodePng(w, h, buf);
}

function dist(x, y, ax, ay) {
  return Math.sqrt((x - ax) ** 2 + (y - ay) ** 2);
}

function encodePng(w, h, rgba) {
  // Add filter byte (0) at the start of each row.
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw);

  const chunks = [];
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', idat));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `pwa-${size}.png`), makePng(size));
  console.log(`wrote public/pwa-${size}.png`);
}
// Apple touch icon (180).
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), makePng(180));
console.log('wrote public/apple-touch-icon.png');
void hex;
