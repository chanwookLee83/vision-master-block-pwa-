// 측정자 간 편차(재현성) 비교. 같은 치수를 두 측정자가 측정한 값의
// 평균 차이를 공차 폭 대비 %로 보고 일치 / 주의 / 불일치로 판정한다.
import { limitsOf } from './tol.js';
import { sampleStats } from './cpk.js';

// 차이(|A평균 − B평균|)가 공차 폭의 몇 % 이하면 "일치" / "주의"인지.
export const APPRAISER_DEFAULTS = { warnPct: 10, failPct: 30 };

export function appraiserCriteria(s) {
  s = s || {}; // getSetting() 은 값이 없으면 null 을 주므로(기본 파라미터로는 안 걸림) 방어
  const n = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
  return {
    warnPct: n(s.warnPct, APPRAISER_DEFAULTS.warnPct),
    failPct: n(s.failPct, APPRAISER_DEFAULTS.failPct),
  };
}

/**
 * @returns { a, b, diff, absDiff, pct, band, grade }
 *   a/b = sampleStats, diff = a.mean − b.mean, pct = |diff| / 공차폭 * 100
 *   grade: '일치' | '주의' | '불일치' | '데이터 부족' | '공차 없음'
 */
export function compareAppraisers(marker, valuesA, valuesB, crit = appraiserCriteria()) {
  const a = sampleStats(valuesA);
  const b = sampleStats(valuesB);
  const lim = limitsOf(marker);
  const band = lim ? lim.hi - lim.lo : null;

  if (a.n === 0 || b.n === 0) return { a, b, diff: null, absDiff: null, pct: null, band, grade: '데이터 부족' };

  const diff = a.mean - b.mean;
  const absDiff = Math.abs(diff);
  if (!band || band <= 0) return { a, b, diff, absDiff, pct: null, band, grade: '공차 없음' };

  const pct = (absDiff / band) * 100;
  const grade = pct > crit.failPct ? '불일치' : pct > crit.warnPct ? '주의' : '일치';
  return { a, b, diff, absDiff, pct, band, grade };
}

export const APPRAISER_GRADE_CLASS = {
  일치: 'pill-ok',
  주의: 'pill-wip',
  불일치: 'pill-ng',
  '데이터 부족': '',
  '공차 없음': '',
};
