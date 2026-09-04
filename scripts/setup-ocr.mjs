// OCR(치수 자동 읽기)용 정적 자산을 public/ocr 로 복사한다.
// - tesseract.js 워커 + tesseract.js-core(wasm) 를 node_modules 에서 복사
// - eng.traineddata.gz 는 없을 때만 내려받아 gzip 압축
// predev / prebuild 에서 자동 실행. 완전 오프라인 동작을 위해 필요.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = path.join(root, 'public', 'ocr');
const coreDir = path.join(outDir, 'core');
mkdirSync(coreDir, { recursive: true });

// 1) tesseract.js 워커 (dist)
const tessDir = path.dirname(require.resolve('tesseract.js/package.json'));
cpSync(path.join(tessDir, 'dist', 'worker.min.js'), path.join(outDir, 'worker.min.js'));

// 2) tesseract.js-core (LSTM 전용, single-file wasm 로더).
//    OEM=LSTM_ONLY 만 쓰므로 simd-lstm + lstm(비-simd 폴백)만 복사한다.
//    core 파일은 wasm 을 base64 로 내장(single-file)하므로 .wasm 별도 파일 불필요.
const coreSrcDir = path.dirname(require.resolve('tesseract.js-core/package.json'));
for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) {
  cpSync(path.join(coreSrcDir, f), path.join(coreDir, f));
}

// 3) eng.traineddata.gz — 이미 있으면 건너뜀
const dataOut = path.join(outDir, 'eng.traineddata.gz');
if (existsSync(dataOut) && statSync(dataOut).size > 100_000) {
  console.log('setup-ocr: eng.traineddata.gz 이미 존재 — 건너뜀');
} else {
  const url = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata';
  console.log('setup-ocr: eng.traineddata 내려받는 중…', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`traineddata 다운로드 실패: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  writeFileSync(dataOut, gzipSync(raw, { level: 9 }));
  console.log(`setup-ocr: eng.traineddata.gz 생성 (${(statSync(dataOut).size / 1e6).toFixed(1)} MB)`);
}

void readFileSync; // (미사용 방지)
console.log('setup-ocr: 완료 →', path.relative(root, outDir));
