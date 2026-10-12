import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePng(size, isMaskable = false) {
  const width = size;
  const height = size;

  // Raw scanlines: each row has 1 filter byte (0) + width * 4 bytes RGBA
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  // Design: Dark background #09090b
  // Center: A blue document icon with folded top-right corner
  const bgR = 10, bgG = 10, bgB = 12; // #0a0a0c

  const docMargin = Math.floor(size * (isMaskable ? 0.22 : 0.16));
  const docLeft = docMargin;
  const docRight = size - docMargin;
  const docTop = docMargin;
  const docBottom = size - docMargin;
  const cornerCut = Math.floor((docRight - docLeft) * 0.28);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      let r = bgR, g = bgG, b = bgB, a = 255;

      // Check if inside document rectangle
      const inDoc = x >= docLeft && x <= docRight && y >= docTop && y <= docBottom;
      const inCornerCut = (x >= docRight - cornerCut) && (y <= docTop + cornerCut) && ((x - (docRight - cornerCut)) + (docTop + cornerCut - y) >= cornerCut);

      if (inDoc && !inCornerCut) {
        // Document body: Gradient blue
        const t = (y - docTop) / (docBottom - docTop);
        // From blue-500 (59, 130, 246) to indigo-600 (79, 70, 229)
        r = Math.floor(37 * (1 - t) + 29 * t);
        g = Math.floor(99 * (1 - t) + 78 * t);
        b = Math.floor(235 * (1 - t) + 216 * t);

        // Document text lines (3 white/light-blue horizontal bars)
        const lineLeft = docLeft + Math.floor((docRight - docLeft) * 0.2);
        const lineRight = docRight - Math.floor((docRight - docLeft) * 0.2);
        const docH = docBottom - docTop;

        const line1Y = docTop + Math.floor(docH * 0.45);
        const line2Y = docTop + Math.floor(docH * 0.60);
        const line3Y = docTop + Math.floor(docH * 0.75);
        const lineThick = Math.max(2, Math.floor(size * 0.025));

        const inLine1 = y >= line1Y && y <= line1Y + lineThick && x >= lineLeft && x <= lineRight;
        const inLine2 = y >= line2Y && y <= line2Y + lineThick && x >= lineLeft && x <= lineRight;
        const inLine3 = y >= line3Y && y <= line3Y + lineThick && x >= lineLeft && x <= lineRight - Math.floor((lineRight - lineLeft) * 0.35);

        if (inLine1 || inLine2 || inLine3) {
          r = 255; g = 255; b = 255;
        }
      } else if (inDoc && inCornerCut) {
        // Folded corner triangle
        const foldX = docRight - cornerCut;
        const foldY = docTop + cornerCut;
        // Triangle from (foldX, docTop) to (docRight, foldY)
        const inFoldFlap = x >= foldX && y <= foldY;
        if (inFoldFlap) {
          // Lighter accent blue for the fold #60a5fa
          r = 96; g = 165; b = 250;
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // Header chunk IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idatData = zlib.deflateSync(rawData);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve('public');
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), generatePng(192));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), generatePng(512));
fs.writeFileSync(path.join(outDir, 'pwa-maskable.png'), generatePng(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), generatePng(180));
console.log('Generated PWA icons in public/');
