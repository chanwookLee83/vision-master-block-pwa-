import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db.js';
import { tolText, fmt } from '../../lib/tol.js';
import { Empty, useToast } from '../../components/ui.jsx';
import { saveFile, safeName } from '../../lib/fs.js';
import { compareAppraisers, appraiserCriteria, APPRAISER_GRADE_CLASS } from '../../lib/appraiser.js';

export default function AppraiserTab({ itemId }) {
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const sessions = useLiveQuery(() => db.sessions.where('itemId').equals(itemId).toArray(), [itemId]);
  const readings = useLiveQuery(() => db.readings.toArray(), []);
  const setting = useLiveQuery(() => db.settings.get('appraiser'), []);

  if (!item || !markers || !sessions || !readings) return null;

  const crit = appraiserCriteria(setting?.value);

  // 측정자별 세션 id 모음
  const bySpector = {};
  for (const s of sessions) {
    const name = (s.inspector || '').trim();
    if (!name) continue;
    (bySpector[name] ||= []).push(s.id);
  }
  const names = Object.keys(bySpector).sort((x, y) => x.localeCompare(y, 'ko'));

  if (markers.length === 0) {
    return (
      <div className="panel">
        <Empty title="치수 번호가 없습니다">번호를 찍고 주간 측정을 입력하세요.</Empty>
      </div>
    );
  }
  if (names.length < 2) {
    return (
      <div className="panel">
        <h2>측정자 비교</h2>
        <Empty title="측정자가 2명 이상 필요합니다">
          서로 다른 측정자 이름으로 각각 측정을 입력하면, 같은 치수의 측정값을 비교해
          측정자 간 편차(재현성)를 확인할 수 있습니다.
          {names.length === 1 && <div className="muted" style={{ marginTop: 6 }}>현재 측정자: {names[0]}</div>}
        </Empty>
      </div>
    );
  }

  const pickA = a || names[0];
  const pickB = b || names.find((n) => n !== pickA) || names[1];

  const idsA = new Set(bySpector[pickA] || []);
  const idsB = new Set(bySpector[pickB] || []);
  const valsFor = (mid, idset) => readings
    .filter((r) => r.markerId === mid && idset.has(r.sessionId) && r.value !== '' && r.value != null)
    .map((r) => Number(r.value));

  const rows = markers.map((m) => ({ m, c: compareAppraisers(m, valsFor(m.id, idsA), valsFor(m.id, idsB), crit) }));
  const gradable = rows.filter((x) => ['일치', '주의', '불일치'].includes(x.c.grade));
  const cnt = (g) => gradable.filter((x) => x.c.grade === g).length;
  const worst = gradable.reduce((mx, x) => (mx == null || x.c.pct > mx.c.pct ? x : mx), null);

  function exportCsv() {
    const head = ['No', '치수이름', '공차', `${pickA} 평균`, `${pickA} n`, `${pickB} 평균`, `${pickB} n`, '차이(A-B)', '공차대비%', '판정'];
    const meta = [
      ['품번', item.partNo || ''], ['품명', item.partName || ''], ['호기', item.machineNo || ''],
      ['측정자 A', pickA], ['측정자 B', pickB],
      ['판정 기준', `일치 ≤ ${crit.warnPct}% · 주의 ≤ ${crit.failPct}% · 초과 불일치 (공차 폭 대비)`],
      [],
    ];
    const body = rows.map(({ m, c }) => [
      m.no, m.name || '', tolText(m),
      c.a.mean == null ? '' : fmt(c.a.mean, 4), c.a.n,
      c.b.mean == null ? '' : fmt(c.b.mean, 4), c.b.n,
      c.diff == null ? '' : fmt(c.diff, 4),
      c.pct == null ? '' : c.pct.toFixed(1),
      c.grade,
    ]);
    saveFile(`측정자비교_${safeName(item.partNo || 'item')}.csv`,
      new Blob(['﻿' + [...meta, head, ...body].map((row) => row.map((v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
      .then((res) => toast(res.target === 'folder' ? `${res.dir} 폴더에 저장했습니다` : 'CSV를 내려받았습니다'));
  }

  return (
    <div className="panel">
      <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ margin: 0 }}>측정자 비교</h2>
        <button className="btn sm" onClick={exportCsv}>CSV 저장</button>
      </div>

      <div className="grid cols-2" style={{ maxWidth: 440, margin: '10px 0' }}>
        <label className="field">
          <span>측정자 A</span>
          <select value={pickA} onChange={(e) => setA(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{n} ({bySpector[n].length}회)</option>)}
          </select>
        </label>
        <label className="field">
          <span>측정자 B</span>
          <select value={pickB} onChange={(e) => setB(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{n} ({bySpector[n].length}회)</option>)}
          </select>
        </label>
      </div>

      <p className="hint">
        같은 치수를 두 측정자가 측정한 값의 <b>평균 차이</b>를 공차 폭 대비 %로 봅니다.
        <b> 일치 ≤ {crit.warnPct}%</b> · <b>주의 ≤ {crit.failPct}%</b> · 초과 <b>불일치</b>.
        기준은 <Link to="/settings">설정</Link>에서 바꿀 수 있습니다.
      </p>

      {pickA === pickB ? (
        <p className="pill-wip" style={{ display: 'inline-block' }}>서로 다른 측정자를 선택하세요.</p>
      ) : (
        <>
          <div className="summary-row" style={{ margin: '12px 0' }}>
            <div className="stat"><div className="k">일치</div><div className="v" style={{ color: 'var(--ok)' }}>{cnt('일치')}</div></div>
            <div className="stat"><div className="k">주의</div><div className="v" style={{ color: 'var(--beige-strong)' }}>{cnt('주의')}</div></div>
            <div className="stat"><div className="k">불일치</div><div className="v" style={{ color: 'var(--ng)' }}>{cnt('불일치')}</div></div>
            {worst && (
              <div className="stat">
                <div className="k">최대 차이 ({worst.m.no}번)</div>
                <div className="v">{worst.c.pct.toFixed(1)}%</div>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="marker-table">
              <thead>
                <tr>
                  <th>No</th><th>치수 이름</th><th className="num">공차</th>
                  <th className="num">{pickA} 평균 (n)</th>
                  <th className="num">{pickB} 평균 (n)</th>
                  <th className="num">차이 (A−B)</th>
                  <th className="num">공차대비</th>
                  <th>판정</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, c }) => (
                  <tr key={m.id} className={c.grade === '불일치' ? 'row-ng' : ''}>
                    <td><b>{m.no}</b></td>
                    <td>{m.name || <span className="muted">-</span>}</td>
                    <td className="num nowrap">{tolText(m)}</td>
                    <td className="num nowrap">{c.a.mean == null ? '-' : fmt(c.a.mean, 4)} <span className="muted">({c.a.n})</span></td>
                    <td className="num nowrap">{c.b.mean == null ? '-' : fmt(c.b.mean, 4)} <span className="muted">({c.b.n})</span></td>
                    <td className="num nowrap">{c.diff == null ? '-' : (c.diff > 0 ? '+' : '') + fmt(c.diff, 4)}</td>
                    <td className="num">{c.pct == null ? '-' : `${c.pct.toFixed(1)}%`}</td>
                    <td>
                      {APPRAISER_GRADE_CLASS[c.grade]
                        ? <span className={APPRAISER_GRADE_CLASS[c.grade]}>{c.grade}</span>
                        : <span className="muted">{c.grade}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: 10 }}>
            차이가 큰 치수는 측정 방법 · 기준점 · 계측기 사용법을 두 측정자가 맞춰 보세요.
            (측정자마다 측정 횟수가 다르면 평균의 신뢰도도 달라집니다.)
          </p>
        </>
      )}
    </div>
  );
}
