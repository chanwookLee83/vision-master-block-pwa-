// 단위 / 계측기 기본 목록 + 헬퍼.
// 실제 선택지는 "기본 목록" + "이미 마커에 입력된 값"을 합쳐서 datalist 로 제공한다.
// (한 번 입력해두면 다음부터 목록에 나타남)

export const DEFAULT_UNITS = ['mm', 'µm', 'cm', 'm', 'inch', '°', "'", '"', 'Ø', 'R', 'C', 'rad', '%'];

// 리스트 박스에 보여줄 한글 설명 (값 자체는 기호/약어 그대로 저장)
export const UNIT_LABELS = {
  mm: 'mm (밀리미터)',
  µm: 'µm (마이크로미터)',
  cm: 'cm (센티미터)',
  m: 'm (미터)',
  inch: 'inch (인치)',
  '°': '° (각도 · 도)',
  "'": "' (각도 · 분)",
  '"': '" (각도 · 초)',
  'Ø': 'Ø (파이 · 지름)',
  R: 'R (반지름)',
  C: 'C (모따기)',
  rad: 'rad (라디안)',
  '%': '% (백분율)',
};

export const unitLabel = (u) => UNIT_LABELS[u] || u;

export const DEFAULT_GAUGES = [
  '버니어캘리퍼스',
  '마이크로미터',
  '하이트게이지',
  '깊이게이지',
  '다이얼게이지',
  '실린더게이지',
  '핀게이지',
  '블록게이지',
  '나사게이지',
  '투영기',
  '3차원측정기(CMM)',
];

export const unitOf = (m) => (m && m.unit) || 'mm';
export const gaugeOf = (m) => (m && m.gauge) || '';

// 마커 배열에서 실제 사용 중인 값들을 뽑아 기본 목록과 합침 (중복 제거, 순서 유지)
export function mergeOptions(defaults, markers, field) {
  const seen = new Set();
  const out = [];
  for (const v of defaults) {
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  for (const m of markers || []) {
    const v = (m[field] || '').trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}
