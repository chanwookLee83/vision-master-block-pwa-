// 의존성 없는 PNG 아이콘 생성기. `npm run gen-icons` 로 실행.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

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
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  draw(set, size);
  // 필터 바이트 0 을 각 스캔라인 앞에 추가
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

function draw(set, s) {
  const rr = s * 0.18; // 모서리 반경
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, rr), s - rr);
    const cy = Math.min(Math.max(y, rr), s - rr);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr || (x >= rr && x <= s - rr) || (y >= rr && y <= s - rr);
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inRounded(x, y)) { set(x, y, 0, 0, 0, 0); continue; }
      // 세로 그라데이션 (indigo → 진한 남색)
      const t = y / s;
      set(x, y, Math.round(79 - 20 * t), Math.round(70 - 20 * t), Math.round(229 - 60 * t));
    }
  }
  // 블록 외곽 (흰 사각 테두리)
  const bx = s * 0.18, bw = s * 0.64, by = s * 0.38, bh = s * 0.24, lw = Math.max(2, s * 0.045);
  const onRect = (x, y) =>
    x >= bx && x <= bx + bw && y >= by && y <= by + bh &&
    (x < bx + lw || x > bx + bw - lw || y < by + lw || y > by + bh - lw);
  // 치수선 (상단)
  const ly = s * 0.24, lx0 = s * 0.18, lx1 = s * 0.82;
  const onDim = (x, y) =>
    (Math.abs(y - ly) < lw * 0.55 && x >= lx0 && x <= lx1) ||
    (Math.abs(x - lx0) < lw * 0.55 && Math.abs(y - ly) < s * 0.05) ||
    (Math.abs(x - lx1) < lw * 0.55 && Math.abs(y - ly) < s * 0.05);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (onRect(x, y) || onDim(x, y)) set(x, y, 255, 255, 255);
    }
  }
  // 마커 점 3개
  for (const fx of [0.30, 0.5, 0.70]) {
    const cx = s * fx, cy = s * 0.5, r = s * 0.045;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r) set(Math.round(cx + x), Math.round(cy + y), 255, 255, 255);
  }
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), png(size, draw));
}
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, draw));
console.log('아이콘 생성 완료 →', outDir);
