import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db.js';
import { tolText, fmt } from '../../lib/tol.js';
import { Empty, useToast } from '../../components/ui.jsx';
import { saveFile, safeName } from '../../lib/fs.js';
import { cpkOf, cpkCriteria, GRADE_LABEL } from '../../lib/cpk.js';

const num = (v, d = 2) => (v == null || !isFinite(v) ? (v === Infinity ? '∞' : '-') : Number(v).toFixed(d));
const gradeClass = { 상: 'pill-ok', 중: 'pill-wip', 하: 'pill-ng', 부족: '' };

// 분석 기간 선택지 (오늘부터 N주 전까지). null = 전체
const PERIODS = [
  ['4', '최근 4주 (약 1개월)'],
  ['8', '최근 8주 (약 2개월)'],
  ['13', '최근 13주 (약 3개월)'],
  ['26', '최근 26주 (약 6개월)'],
  ['all', '전체 기간'],
];

export default function CpkTab({ itemId }) {
  const toast = useToast();
  const [period, setPeriod] = useState('13');

  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const sessions = useLiveQuery(() => db.sessions.where('itemId').equals(itemId).toArray(), [itemId]);
  const readings = useLiveQuery(() => db.readings.toArray(), []);
  const cpkSetting = useLiveQuery(() => db.settings.get('cpk'), []);

  if (!item || !markers || !sessions || !readings) return null;
  if (markers.length === 0) {
    return (
      <div className="panel">
        <Empty title="치수 번호가 없습니다">
          &lsquo;도면 · 번호 지정&rsquo; 탭에서 번호를 먼저 찍고 주간 측정을 입력하세요.
        </Empty>
      </div>
    );
  }

  const crit = cpkCriteria(cpkSetting?.value);

  // 기간 필터 → 대상 세션
  const cutoff = period === 'all'
    ? null
    : new Date(Date.now() - Number(period) * 7 * 86400000).toISOString().slice(0, 10);
  const activeSessions = sessions
    .filter((s) => !cutoff || (s.date && s.date >= cutoff))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const activeIds = new Set(activeSessions.map((s) => s.id));
  const weeks = [...new Set(activeSessions.map((s) => s.weekKey || s.date).filter(Boolean))];
  const dateSpan = activeSessions.length
    ? `${activeSessions[0].date || '?'} ~ ${activeSessions[activeSessions.length - 1].date || '?'}`
    : '-';

  const valuesByMarker = {};
  for (const m of markers) valuesByMarker[m.id] = [];
  for (const r of readings) {
    if (valuesByMarker[r.markerId] && activeIds.has(r.sessionId) && r.value !== '' && r.value != null) {
      valuesByMarker[r.markerId].push(Number(r.value));
    }
  }

  const rows = markers.map((m) => ({ m, r: cpkOf(m, valuesByMarker[m.id], crit) }));
  const withTol = rows.filter((x) => x.r);
  const count = (g) => withTol.filter((x) => x.r.grade === g).length;
  const worst = withTol
    .filter((x) => x.r.cpk != null && isFinite(x.r.cpk))
    .reduce((min, x) => (min == null || x.r.cpk < min.r.cpk ? x : min), null);
  const enoughData = withTol.some((x) => x.r.n >= crit.minN);

  function exportCsv() {
    const head = ['No', '치수이름', '규격하한(LSL)', '규격상한(USL)', '공차', '측정횟수', '평균', '표준편차', 'Cp', 'Cpk', '등급'];
    const meta = [
      ['품번', item.partNo || ''], ['품명', item.partName || ''], ['호기', item.machineNo || ''],
      ['분석 기간', PERIODS.find(([k]) => k === period)?.[1] || period],
      ['대상 세션', `${activeSessions.length}개 (${dateSpan})`],
      ['측정 주차', weeks.join(' ')],
      ['Cpk 기준', `상 ≥ ${crit.high} · 중 ≥ ${crit.mid} · 최소 측정 ${crit.minN}회`],
      [],
    ];
    const body = rows.map(({ m, r }) => {
      if (!r) return [m.no, m.name || '', '', '', tolText(m), '', '', '', '', '', '공차 미입력'];
      return [
        m.no, m.name || '', fmt(r.lsl, 4), fmt(r.usl, 4), tolText(m), r.n,
        r.mean == null ? '' : fmt(r.mean, 4),
        r.sd == null ? '' : fmt(r.sd, 5),
        r.cp == null ? '' : num(r.cp), r.cpk == null ? '' : num(r.cpk),
        GRADE_LABEL[r.grade] || r.grade,
      ];
    });
    saveFile(`공정능력_${safeName(item.partNo || 'item')}.csv`,
      new Blob(['﻿' + [...meta, head, ...body].map((row) => row.map((c) => {
        const s = String(c ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
      .then((res) => toast(res.target === 'folder' ? `${res.dir} 폴더에 저장했습니다` : 'CSV를 내려받았습니다'));
  }

  return (
    <div className="panel">
      <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ margin: 0 }}>공정능력 (Cp / Cpk)</h2>
        <button className="btn sm" onClick={exportCsv}>CSV 저장</button>
      </div>

      <div className="btn-row" style={{ margin: '10px 0', alignItems: 'center' }}>
        <label className="field" style={{ margin: 0, minWidth: 220 }}>
          <span>분석 기간</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <span className="muted" style={{ fontSize: 13 }}>
          대상 <b>{activeSessions.length}회</b> 측정 ({weeks.length}주){activeSessions.length ? ` · ${dateSpan}` : ''}
        </span>
      </div>

      <p className="hint">
        선택한 기간의 주간 측정값을 모아 치수별 Cpk 를 계산합니다. 등급 기준:
        <b> 상 ≥ {crit.high}</b> · <b>중 ≥ {crit.mid}</b> · 그 미만 <b>하</b> ·
        측정 <b>{crit.minN}회</b> 미만은 &lsquo;데이터 부족&rsquo;.
        기준은 <Link to="/settings">설정</Link>에서 바꿀 수 있습니다.
      </p>

      {!enoughData && (
        <p className="pill-wip" style={{ display: 'inline-block' }}>
          측정 횟수가 부족합니다 — 주별로 계속 측정하면 이 기간에 자동으로 쌓입니다
          (신뢰할 만한 Cpk 는 보통 25회 이상).
        </p>
      )}

      <div className="summary-row" style={{ margin: '12px 0' }}>
        <div className="stat"><div className="k">상</div><div className="v" style={{ color: 'var(--ok)' }}>{count('상')}</div></div>
        <div className="stat"><div className="k">중</div><div className="v" style={{ color: 'var(--beige-strong)' }}>{count('중')}</div></div>
        <div className="stat"><div className="k">하</div><div className="v" style={{ color: 'var(--ng)' }}>{count('하')}</div></div>
        <div className="stat"><div className="k">데이터 부족</div><div className="v">{count('부족')}</div></div>
        {worst && (
          <div className="stat"><div className="k">최저 Cpk ({worst.m.no}번)</div><div className="v">{num(worst.r.cpk)}</div></div>
        )}
      </div>

      <div className="table-wrap">
        <table className="marker-table">
          <thead>
            <tr>
              <th>No</th><th>치수 이름</th>
              <th className="num">규격 (LSL ~ USL)</th>
              <th className="num">측정</th>
              <th className="num">평균</th>
              <th className="num">σ</th>
              <th className="num">Cp</th>
              <th className="num">Cpk</th>
              <th>등급</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, r }) => (
              <tr key={m.id} className={r && r.grade === '하' ? 'row-ng' : ''}>
                <td><b>{m.no}</b></td>
                <td>{m.name || <span className="muted">-</span>}</td>
                {r ? (
                  <>
                    <td className="num nowrap">{fmt(r.lsl, 4)} ~ {fmt(r.usl, 4)}</td>
                    <td className="num">{r.n}회</td>
                    <td className="num nowrap">{r.mean == null ? '-' : fmt(r.mean, 4)}</td>
                    <td className="num nowrap">{r.sd == null ? '-' : fmt(r.sd, 5)}</td>
                    <td className="num">{r.cp == null ? '-' : num(r.cp)}</td>
                    <td className="num"><b>{r.cpk == null ? '-' : num(r.cpk)}</b></td>
                    <td>
                      {r.grade === '부족'
                        ? <span className="muted">데이터 부족</span>
                        : <span className={gradeClass[r.grade]}>{r.grade}</span>}
                    </td>
                  </>
                ) : (
                  <td colSpan={7} className="muted">공차(기준치수)가 없어 계산할 수 없습니다</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Cpk = min[(USL−평균)/3σ, (평균−LSL)/3σ]. 산포(σ)가 0이면 ∞ 로 표시됩니다.
      </p>
    </div>
  );
}
