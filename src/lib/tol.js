// 공차 계산 / 주차 계산 유틸

// 마커의 유효 상/하한 (기준치수 + 공차)
export function limitsOf(m) {
  if (m == null || m.nominal == null || isNaN(m.nominal)) return null;
  const up = Number(m.tolUpper ?? 0);
  const lo = Number(m.tolLower ?? 0);
  return {
    lo: round6(m.nominal + Math.min(up, lo)),
    hi: round6(m.nominal + Math.max(up, lo))
  };
}

// 측정값 판정: 'OK' | 'NG' | null(미입력)
export function judge(m, value) {
  if (value == null || value === '' || isNaN(Number(value))) return null;
  const lim = limitsOf(m);
  if (!lim) return null;
  const v = Number(value);
  const eps = 1e-9;
  return v >= lim.lo - eps && v <= lim.hi + eps ? 'OK' : 'NG';
}

// 편차 (측정값 - 기준치수)
export function deviationOf(m, value) {
  if (value == null || value === '' || isNaN(Number(value)) || m?.nominal == null) return null;
  return round6(Number(value) - m.nominal);
}

export function round6(n) {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

// 공차 표기 문자열: ±0.02 또는 +0.03/-0.01
export function tolText(m) {
  const up = Number(m.tolUpper ?? 0);
  const lo = Number(m.tolLower ?? 0);
  if (Math.abs(up + lo) < 1e-9 && up !== 0) return `±${fmt(Math.abs(up))}`;
  return `${up >= 0 ? '+' : ''}${fmt(up)} / ${lo >= 0 ? '+' : ''}${fmt(lo)}`;
}

export function fmt(n, digits = 3) {
  if (n == null || n === '' || isNaN(Number(n))) return '';
  return Number(n)
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

// ISO 주차 키: 2026-W36
export function isoWeekKey(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// 현재 시각 HH:MM (24시간)
export function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
