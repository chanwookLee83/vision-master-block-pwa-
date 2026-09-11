// 공정능력지수(Cp / Cpk) 계산 + 상·중·하 등급.
import { limitsOf, round6 } from './tol.js';

// Cpk 등급 기본 기준. 설정(settings 테이블)에서 덮어쓸 수 있다.
//  Cpk >= high  → 상 (양호)
//  Cpk >= mid   → 중 (주의)
//  그 미만       → 하 (개선 필요)
//  n < minN     → 데이터 부족
export const CPK_DEFAULTS = { high: 1.33, mid: 1.0, minN: 3 };

export function cpkCriteria(s) {
  s = s || {}; // getSetting() 은 값이 없으면 null 을 주므로(기본 파라미터로는 안 걸림) 방어
  const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
  return {
    high: num(s.high, CPK_DEFAULTS.high),
    mid: num(s.mid, CPK_DEFAULTS.mid),
    minN: Math.max(2, Math.round(num(s.minN, CPK_DEFAULTS.minN))),
  };
}

// 표본 통계 (표본표준편차 n-1)
export function sampleStats(values) {
  const xs = values.map(Number).filter((v) => !isNaN(v));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1
    ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
    : 0;
  return { n, mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * 한 치수 항목의 공정능력.
 * @returns null (공차 없음) | { n, mean, sd, min, max, usl, lsl, cp, cpu, cpl, cpk, grade }
 */
export function cpkOf(marker, values, criteria = cpkCriteria()) {
  const lim = limitsOf(marker);
  if (!lim) return null;
  const { n, mean, sd, min, max } = sampleStats(values);
  const usl = lim.hi;
  const lsl = lim.lo;

  const base = { n, mean, sd, min, max, usl, lsl, cp: null, cpu: null, cpl: null, cpk: null };

  if (n < criteria.minN) return { ...base, grade: '부족' };

  if (sd === 0 || sd < 1e-12) {
    // 산포가 0 → 규격 안이면 매우 양호, 밖이면 불량
    const inSpec = mean >= lsl - 1e-9 && mean <= usl + 1e-9;
    return { ...base, cp: Infinity, cpu: Infinity, cpl: Infinity, cpk: inSpec ? Infinity : 0,
      grade: inSpec ? '상' : '하' };
  }

  const cp = round6((usl - lsl) / (6 * sd));
  const cpu = round6((usl - mean) / (3 * sd));
  const cpl = round6((mean - lsl) / (3 * sd));
  const cpk = round6(Math.min(cpu, cpl));

  const grade = cpk >= criteria.high ? '상' : cpk >= criteria.mid ? '중' : '하';
  return { ...base, cp, cpu, cpl, cpk, grade };
}

export const GRADE_LABEL = {
  상: '상 (양호)',
  중: '중 (주의)',
  하: '하 (개선 필요)',
  부족: '데이터 부족',
};
