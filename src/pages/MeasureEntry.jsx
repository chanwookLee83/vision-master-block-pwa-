import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setReading, getSetting } from '../lib/db.js';
import { judge, deviationOf, limitsOf, tolText, fmt, isoWeekKey, nowTimeStr } from '../lib/tol.js';
import { Crumbs, useToast, DecimalInput } from '../components/ui.jsx';
import { saveFile, safeName, getSaveDir, writeToDir } from '../lib/fs.js';
import { sessionCsv, sessionReportHtml, openPrint } from '../lib/report.js';
import { exportAll } from '../lib/backup.js';
import MarkerCanvas from '../components/MarkerCanvas.jsx';

export default function MeasureEntry() {
  const { id, sessionId } = useParams();
  const itemId = Number(id);
  const sid = Number(sessionId);
  const nav = useNavigate();
  const toast = useToast();
  const [focusMarker, setFocusMarker] = useState(null);
  // 입력 중인 값을 낙관적으로 보관. IndexedDB 저장(비동기) 반향이 늦게 와서
  // 빠르게 타이핑할 때 글자가 잘리는 것을 막는다. (한번 건드린 칸은 로컬이 우선)
  const [edits, setEdits] = useState({});
  const [sEdits, setSEdits] = useState({}); // 측정 정보(측정자·주차·비고 등) 낙관적 보관

  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const session = useLiveQuery(() => db.sessions.get(sid), [sid]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const drawings = useLiveQuery(() => db.drawings.where('itemId').equals(itemId).sortBy('sort'), [itemId]);
  const readings = useLiveQuery(() => db.readings.where('sessionId').equals(sid).toArray(), [sid]);

  // 측정 시각이 비어 있으면 자동으로 현재 시각 기록
  useEffect(() => {
    if (session && !session.time) db.sessions.update(sid, { time: nowTimeStr() });
  }, [session, sid]);

  if (!item || !session || !markers || !drawings || !readings) return null;

  const sval = (k, fallback = '') => sEdits[k] ?? (session[k] ?? fallback);
  const patchSession = (patch) => {
    setSEdits((e) => ({ ...e, ...patch }));
    db.sessions.update(sid, patch);
  };

  const valueOf = (markerId) =>
    edits[markerId] ?? (readings.find((r) => r.markerId === markerId)?.value ?? '');
  const onInput = (mid, n) => {
    setEdits((e) => ({ ...e, [mid]: n == null ? '' : n }));
    setReading(sid, mid, n);
  };
  const statusOf = (m) => {
    const j = judge(m, valueOf(m.id));
    return j === 'OK' ? 'ok' : j === 'NG' ? 'ng' : null;
  };

  const results = markers.map((m) => judge(m, valueOf(m.id)));
  const okN = results.filter((r) => r === 'OK').length;
  const ngN = results.filter((r) => r === 'NG').length;
  const blankN = results.filter((r) => r === null).length;

  const baseName = () =>
    `측정_${safeName(item.partNo || 'item')}_${safeName(session.weekKey || session.date || '')}`;

  async function exportCsv() {
    const res = await saveFile(`${baseName()}.csv`, sessionCsv(item, session, markers, valueOf), 'text/csv;charset=utf-8');
    toast(res.target === 'folder' ? `${res.dir} 폴더에 저장했습니다` : 'CSV를 내려받았습니다');
  }

  function printReport() {
    const ok = openPrint(sessionReportHtml(item, session, markers, valueOf));
    if (!ok) toast('팝업이 차단되어 인쇄창을 열 수 없습니다');
  }

  async function finish() {
    const auto = await getSetting('autoSave', false);
    const dir = auto ? await getSaveDir({ prompt: true }) : null;
    if (dir) {
      try {
        await writeToDir(dir, `${baseName()}.csv`, sessionCsv(item, session, markers, valueOf));
        const dump = await exportAll();
        await writeToDir(dir, 'vmb-backup-최신.json',
          new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
        toast(`${dir.name} 폴더에 CSV·백업을 저장했습니다`);
      } catch (e) {
        toast('폴더 저장 실패: ' + e.message);
      }
    } else {
      toast('저장되었습니다');
    }
    nav(`/items/${itemId}`);
  }

  const byDrawing = drawings
    .map((d) => ({ d, ms: markers.filter((m) => m.drawingId === d.id) }))
    .filter((g) => g.ms.length);
  const orphan = markers.filter((m) => !drawings.find((d) => d.id === m.drawingId));

  return (
    <>
      <Crumbs
        trail={[
          { label: '품목', to: '/' },
          { label: `${item.partNo} (${item.machineNo})`, to: `/items/${itemId}` },
          { label: `측정 ${session.weekKey || ''}` }
        ]}
      />

      <div className="panel">
        <h2>측정 정보</h2>
        <div className="grid cols-4">
          <label className="field">
            <span>측정일</span>
            <input
              type="date"
              value={sval('date')}
              onChange={(e) => patchSession({ date: e.target.value, weekKey: sval('weekKey') || isoWeekKey(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>측정 시각</span>
            <input
              type="time"
              value={sval('time')}
              onChange={(e) => patchSession({ time: e.target.value })}
            />
          </label>
          <label className="field">
            <span>주차</span>
            <input value={sval('weekKey')} onChange={(e) => patchSession({ weekKey: e.target.value })} placeholder="2026-W36" />
          </label>
          <label className="field">
            <span>측정자</span>
            <input
              value={sval('inspector')}
              onChange={(e) => patchSession({ inspector: e.target.value })}
              placeholder="이름"
            />
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>비고</span>
          <input value={sval('note')} onChange={(e) => patchSession({ note: e.target.value })} placeholder="측정 순서 / 방향 / 장비 등" />
        </label>
      </div>

      <div className="panel">
        <div className="summary-row">
          <div className="stat ok"><div className="k">OK</div><div className="v">{okN}</div></div>
          <div className="stat ng"><div className="k">NG</div><div className="v">{ngN}</div></div>
          <div className="stat"><div className="k">미입력</div><div className="v">{blankN}</div></div>
          <div className="stat"><div className="k">전체</div><div className="v">{markers.length}</div></div>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={exportCsv}>CSV 저장</button>
          <button className="btn sm" onClick={printReport}>인쇄 / PDF</button>
        </div>
        {ngN > 0 && <p className="pill-ng" style={{ display: 'inline-block' }}>공차 이탈 {ngN}건 — 확인 필요</p>}
      </div>

      {markers.length === 0 && (
        <div className="panel">
          치수 번호가 없습니다. <Link to={`/items/${itemId}`}>도면 탭</Link>에서 번호를 먼저 지정하세요.
        </div>
      )}

      {byDrawing.map(({ d, ms }) => (
        <div className="panel" key={d.id}>
          <h2>{d.name}</h2>
          <div className="measure-layout">
            <div className="measure-drawing">
              <MarkerCanvas
                src={d.dataUrl}
                markers={ms}
                selectedId={focusMarker}
                statusOf={statusOf}
                onSelect={setFocusMarker}
                small
              />
              <p className="hint">
                도면의 번호 = 아래 표의 <b>No</b>. 마커 색: <span className="cell-ok">초록 OK</span> ·{' '}
                <span className="cell-ng">빨강 NG</span> · 회색 미입력
              </p>
            </div>
            <MeasureTable
              markers={ms}
              valueOf={valueOf}
              focusMarker={focusMarker}
              setFocusMarker={setFocusMarker}
              onInput={onInput}
            />
          </div>
        </div>
      ))}

      {orphan.length > 0 && (
        <div className="panel">
          <h2>도면 미지정 번호</h2>
          <MeasureTable
            markers={orphan}
            valueOf={valueOf}
            focusMarker={focusMarker}
            setFocusMarker={setFocusMarker}
            onInput={onInput}
          />
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={finish}>완료</button>
        <button className="btn" onClick={exportCsv}>CSV 저장</button>
        <button className="btn" onClick={printReport}>인쇄 / PDF</button>
        <span className="muted">입력 즉시 자동 저장됩니다.</span>
      </div>
    </>
  );
}

function MeasureTable({ markers, valueOf, onInput, focusMarker, setFocusMarker }) {
  const gauges = [...new Set(markers.map((m) => (m.gauge || '').trim()).filter(Boolean))];
  const units = [...new Set(markers.map((m) => m.unit || 'mm'))];

  return (
    <div>
      <div className="measure-cap">
        <span>계측기 <b>{gauges.join(', ') || '-'}</b></span>
        <span>단위 <b>{units.join(', ')}</b></span>
        <span className="measure-cap-hint">→ <b>측정값</b> 칸(베이지색)에 입력하세요</span>
      </div>
      <div className="table-wrap">
        <table className="measure-table">
          <thead>
            <tr>
              <th>No</th><th>이름</th>
              <th className="num">기준</th><th className="num">공차</th><th className="num">합격범위</th>
              <th className="num mv-head">측정값</th><th className="num">편차</th><th>판정</th>
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const v = valueOf(m.id);
              const j = judge(m, v);
              const dev = deviationOf(m, v);
              const lim = limitsOf(m);
              const unit = m.unit || 'mm';
              const mvClass = j === 'OK' ? 'mv mv-ok' : j === 'NG' ? 'mv mv-ng' : 'mv';
              return (
                <tr
                  key={m.id}
                  className={j === 'NG' ? 'row-ng' : ''}
                  onFocus={() => setFocusMarker(m.id)}
                  style={m.id === focusMarker ? { outline: '2px solid var(--brand)', outlineOffset: '-2px' } : undefined}
                >
                  <td><span className="marker-no">{m.no}</span></td>
                  <td className="muted" title={m.name || ''} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name || '-'}</td>
                  <td className="num nowrap">{fmt(m.nominal)} <span className="muted">{unit}</span></td>
                  <td className="num nowrap">{tolText(m)}</td>
                  <td className="num nowrap">
                    {lim
                      ? <b>{fmt(lim.lo)} ~ {fmt(lim.hi)}</b>
                      : <span className="muted">기준 미입력</span>}
                  </td>
                  <td className="num mv-cell">
                    <DecimalInput
                      className={`right ${mvClass}`} style={{ width: 116 }}
                      value={v}
                      onChange={(n) => onInput(m.id, n)}
                      placeholder={m.nominal != null ? `${fmt(m.nominal)} 입력` : '측정값'}
                    />
                  </td>
                  <td className={`num nowrap ${dev != null && Math.abs(dev) > 1e-9 ? (j === 'NG' ? 'cell-ng' : '') : ''}`}>
                    {dev != null ? (dev > 0 ? '+' : '') + fmt(dev) : ''}
                  </td>
                  <td>
                    {j === 'OK' && <span className="pill-ok">OK</span>}
                    {j === 'NG' && <span className="pill-ng">NG</span>}
                    {j === null && (m.nominal == null ? <span className="muted">기준?</span> : <span className="muted">-</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
