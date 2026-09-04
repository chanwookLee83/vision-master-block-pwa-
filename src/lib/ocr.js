// 도면 영역(ROI)에서 치수 텍스트를 읽어 기준치수 + 공차로 파싱한다.
// Tesseract.js 를 public/ocr/ 에 번들된 자산으로 로드해 완전 오프라인 동작.
// 자산은 scripts/setup-ocr.mjs 가 생성한다 (predev / prebuild 자동 실행).

let workerPromise = null;

function assetUrl(rel) {
  return new URL(import.meta.env.BASE_URL + rel, document.baseURI).href;
}

// Tesseract 워커 싱글턴. 첫 호출에서만 로드(수 MB) — 이후 재사용.
export function getOcrWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: assetUrl('ocr/worker.min.js'),
      corePath: assetUrl('ocr/core'),
      langPath: assetUrl('ocr/'),
      gzip: true,
      logger: onProgress ? (m) => onProgress(m) : undefined,
    });
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,+-/±ØR ',
      tessedit_pageseg_mode: '7', // 한 줄 텍스트
      preserve_interword_spaces: '1',
    });
    return worker;
  })();
  // 실패 시 다음 호출에서 재시도할 수 있도록 캐시 해제
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

export function ocrWorkerLoaded() {
  return !!workerPromise;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('도면 이미지를 불러오지 못했습니다'));
    img.src = src;
  });
}

// ROI(상대좌표 0~1)를 잘라 확대 + 그레이스케일 + Otsu 이진화한 PNG dataURL 반환.
// 글자 높이를 ~targetHeight 픽셀로 키워 인식률을 높인다.
export async function cropForOcr(src, roi, { targetHeight = 220, maxWidth = 2400, pad = 0.06 } = {}) {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // ROI 를 약간 넓혀(pad) 글자 잘림 방지
  const px0 = roi.xr - roi.wr * pad;
  const py0 = roi.yr - roi.hr * pad;
  const pw = roi.wr * (1 + pad * 2);
  const ph = roi.hr * (1 + pad * 2);
  const sx = Math.max(0, Math.min(iw - 1, px0 * iw));
  const sy = Math.max(0, Math.min(ih - 1, py0 * ih));
  const sw = Math.max(1, Math.min(iw - sx, pw * iw));
  const sh = Math.max(1, Math.min(ih - sy, ph * ih));
  if (sw < 3 || sh < 3) throw new Error('영역이 너무 작습니다. 더 크게 지정하세요.');

  let s = targetHeight / sh;
  s = Math.max(2, Math.min(s, maxWidth / sw, 12));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * s);
  canvas.height = Math.round(sh * s);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = imgData.data;
  const n = canvas.width * canvas.height;
  const gray = new Uint8ClampedArray(n);
  const hist = new Array(256).fill(0);
  for (let i = 0, j = 0; i < p.length; i += 4, j += 1) {
    const g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
    gray[j] = g;
    hist[g] += 1;
  }
  // Otsu 임계값
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let i = 0; i < 256; i += 1) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = i; }
  }
  const t = threshold + 6; // 얇은 획 보존 쪽으로 약간 편향
  for (let i = 0, j = 0; i < p.length; i += 4, j += 1) {
    const v = gray[j] > t ? 255 : 0;
    p[i] = p[i + 1] = p[i + 2] = v;
    p[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

// OCR 텍스트 → { nominal, tolMode, tolUpper, tolLower } 파싱.
// 예: "27.888±0.02", "27.888 +0.03/-0.01", "Ø27.888", "27,888"
export function parseDimension(rawText) {
  const raw = (rawText || '').trim();
  let t = raw
    .replace(/[，、]/g, ',')
    .replace(/,/g, '.')
    .replace(/[·•∙°]/g, '.')
    .replace(/[＋﹢]/g, '+')
    .replace(/[－﹣—–]/g, '-')
    .replace(/[∓]/g, '±')
    .replace(/\s+/g, ' ')
    .trim();

  // 앞쪽 비숫자 기호 제거 (Ø, ⌀, φ, R, 2x 등)
  t = t.replace(/^[^\d±+-]*(?=[\d±+-])/, '');
  t = t.replace(/^([+-]?\d)/, '$1'); // no-op 방어

  // 숫자 오인식 보정 (숫자 문맥에서만)
  t = t
    .replace(/[oO]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/(\d)[sS](\d)/g, '$15$2')
    .replace(/(\d)[bB](\d)/g, '$18$2')
    .replace(/(\d)[zZ](\d)/g, '$12$2')
    .replace(/(\d)\/(?=[.\d])/g, '$17'); // 숫자 뒤 "/" 는 대개 "7" 오인식

  const num = '(\\d+(?:\\.\\d+)?)';
  const clean = (x) => Number(String(x).replace(/\s+/g, ''));

  // 1) 대칭 공차: 27.888 ± 0.02
  let m = t.match(new RegExp(`${num}\\s*(?:\\u00b1|\\+\\s*-|-\\s*\\+)\\s*${num}`));
  if (m) {
    const tol = Math.abs(Number(m[2]));
    return { ok: true, raw, nominal: Number(m[1]), tolMode: 'sym', tolUpper: tol, tolLower: -tol };
  }

  // 2) 비대칭 공차: 27.888 +0.03 / -0.01  (순서/슬래시 무관)
  m = t.match(new RegExp(`${num}\\s*([+-]\\s*\\d+(?:\\.\\d+)?)\\s*/?\\s*([+-]\\s*\\d+(?:\\.\\d+)?)`));
  if (m) {
    const a = clean(m[2]);
    const b = clean(m[3]);
    return {
      ok: true, raw, nominal: Number(m[1]), tolMode: 'asym',
      tolUpper: Math.max(a, b), tolLower: Math.min(a, b),
    };
  }

  // 3) "+" 한쪽만: ± 오인식이 흔하므로 대칭으로 해석
  m = t.match(new RegExp(`${num}\\s*\\+\\s*(\\d+(?:\\.\\d+)?)`));
  if (m) {
    const tol = Number(m[2]);
    return { ok: true, raw, nominal: Number(m[1]), tolMode: 'sym', tolUpper: tol, tolLower: -tol, assumedSym: true };
  }

  // 4) "-" 한쪽만: 27.888 -0.05 (상한 0)
  m = t.match(new RegExp(`${num}\\s*-\\s*(\\d+(?:\\.\\d+)?)`));
  if (m) {
    const v = Number(m[2]);
    return { ok: true, raw, nominal: Number(m[1]), tolMode: 'asym', tolUpper: 0, tolLower: -v };
  }

  // 5) 기준치수만
  m = t.match(new RegExp(num));
  if (m) return { ok: true, raw, nominal: Number(m[1]) };

  return { ok: false, raw, error: '숫자를 찾지 못했습니다' };
}

// ROI 를 OCR 해서 파싱 결과 + 미리보기 이미지 + 신뢰도 반환.
export async function readDimensionFromRoi(src, roi, onProgress) {
  const previewUrl = await cropForOcr(src, roi);
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(previewUrl);
  const parsed = parseDimension(data.text || '');
  return { ...parsed, text: (data.text || '').trim(), confidence: Math.round(data.confidence || 0), previewUrl };
}
