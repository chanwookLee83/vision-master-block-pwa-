// 의존성 없는 PNG 아이콘 생성기. `npm run gen-icons` 로 실행.
// favicon.svg 와 같은 도안(가로 자·눈금), 브랜드 색(#37718e).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BRAND = [0x37, 0x71, 0x8e];

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td), 0);
  return Buffer.concat([len, td, crc]);
}

function png(size, draw) {
  // 3배로 그린 뒤 박스 다운스케일 → 가장자리 안티에일리어싱
  const SS = 3, big = size * SS;
  const hi = Buffer.alloc(big * big * 4);
  const set = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= big || y >= big) return;
    const i = (y * big + x) * 4;
    hi[i] = r; hi[i + 1] = g; hi[i + 2] = b; hi[i + 3] = a;
  };
  draw(set, big);
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++)
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * big + (x * SS + dx)) * 4;
          r += hi[i]; g += hi[i + 1]; b += hi[i + 2]; a += hi[i + 3];
        }
      const n = SS * SS, o = (y * size + x) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n);
      px[o + 2] = Math.round(b / n); px[o + 3] = Math.round(a / n);
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// frac = 자(눈금 바)가 아이콘에서 차지하는 가로 비율.
// rounded = 배경 모서리 라운딩(마스커블은 false 로 꽉 채움).
function makeDraw(frac, rounded) {
  return (set, s) => {
    const rr = s * 0.18;
    const inBg = (x, y) => {
      if (!rounded) return true;
      const cx = Math.min(Math.max(x, rr), s - rr);
      const cy = Math.min(Math.max(y, rr), s - rr);
      return (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr || (x >= rr && x <= s - rr) || (y >= rr && y <= s - rr);
    };
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (inBg(x, y)) set(x, y, BRAND[0], BRAND[1], BRAND[2]);
        else set(x, y, 0, 0, 0, 0);
      }
    }
    // 가로 자
    const w = s * frac, h = w * 0.375, bx = (s - w) / 2, by = (s - h) / 2;
    for (let y = Math.round(by); y < by + h; y++)
      for (let x = Math.round(bx); x < bx + w; x++)
        set(x, y, 255, 255, 255);
    // 눈금 (자 위쪽 가장자리에서 아래로, 번갈아 길이)
    const tw = Math.max(2, h * 0.11);
    for (let i = 1; i < 5; i++) {
      const tx = bx + (w * i) / 5;
      const tl = (i % 2 ? 0.5 : 0.34) * h;
      for (let y = Math.round(by); y < by + tl; y++)
        for (let x = Math.round(tx - tw / 2); x <= tx + tw / 2; x++)
          set(x, y, BRAND[0], BRAND[1], BRAND[2]);
    }
  };
}

writeFileSync(join(outDir, 'icon-192.png'), png(192, makeDraw(0.64, true)));
writeFileSync(join(outDir, 'icon-512.png'), png(512, makeDraw(0.64, true)));
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, makeDraw(0.46, false)));
console.log('아이콘 생성 완료 →', outDir);
