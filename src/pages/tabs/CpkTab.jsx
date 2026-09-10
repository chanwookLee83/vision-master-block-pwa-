import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db.js';
import { tolText, fmt } from '../../lib/tol.js';
import { Empty, useToast } from '../../components/ui.jsx';
import { saveFile, safeName } from '../../lib/fs.js';
import { cpkOf, cpkCriteria, GRADE_LABEL } from '../../lib/cpk.js';

const num = (v, d = 2) => (v == null || !isFinite(v) ? (v === Infinity ? '∞' : '-') : Number(v).toFixed(d));
const gradeClass = { 상: 'pill-ok', 중: 'pill-wip', 하: 'pill-ng', 부족: '' };

export default function CpkTab({ itemId }) {
  const toast = useToast();
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
  const valuesByMarker = {};
  for (const m of markers) valuesByMarker[m.id] = [];
  for (const r of readings) {
    if (valuesByMarker[r.markerId] && r.value !== '' && r.value != null) {
      valuesByMarker[r.markerId].push(Number(r.value));
    }
  }

  const rows = markers.map((m) => ({ m, r: cpkOf(m, valuesByMarker[m.id], crit) }));
  const withTol = rows.filter((x) => x.r);
  const count = (g) => withTol.filter((x) => x.r.grade === g).length;
  const worst = withTol
    .filter((x) => x.r.cpk != null && isFinite(x.r.cpk))
    .reduce((min, x) => (min == null || x.r.cpk < min.r.cpk ? x : min), null);

  function exportCsv() {
    const head = ['No', '치수이름', '규격하한(LSL)', '규격상한(USL)', '공차', '측정횟수', '평균', '표준편차', 'Cp', 'Cpk', '등급'];
    const meta = [
      ['품번', item.partNo || ''], ['품명', item.partName || ''], ['호기', item.machineNo || ''],
      ['측정 세션 수', String(sessions.length)],
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
      <p className="hint">
        주간 측정값 전체를 모아 치수별 Cpk 를 계산합니다. 등급 기준:
        <b> 상 ≥ {crit.high}</b> · <b>중 ≥ {crit.mid}</b> · 그 미만 <b>하</b> ·
        측정 <b>{crit.minN}회</b> 미만은 &lsquo;데이터 부족&rsquo;.
        기준은 <Link to="/settings">설정</Link>에서 바꿀 수 있습니다.
      </p>

      <div className="summary-row" style={{ marginBottom: 12 }}>
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
        신뢰할 만한 Cpk 는 보통 25회 이상 측정이 필요합니다.
      </p>
    </div>
  );
}
