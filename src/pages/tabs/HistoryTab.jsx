import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db.js';
import { judge, limitsOf, tolText, fmt } from '../../lib/tol.js';
import { Empty, useToast, CollapsePanel } from '../../components/ui.jsx';
import { saveFile, safeName } from '../../lib/fs.js';
import { historyCsv, historyReportHtml, openPrint } from '../../lib/report.js';

export default function HistoryTab({ itemId }) {
  const toast = useToast();
  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const sessions = useLiveQuery(() => db.sessions.where('itemId').equals(itemId).sortBy('date'), [itemId]);
  const readings = useLiveQuery(() => db.readings.toArray(), []);

  if (!item || !markers || !sessions || !readings) return null;
  if (markers.length === 0 || sessions.length === 0) {
    return (
      <div className="panel">
        <Empty title="이력을 표시할 데이터가 없습니다">치수 번호를 지정하고 주간 측정을 1회 이상 입력하세요.</Empty>
      </div>
    );
  }

  const key = (sid, mid) => `${sid}:${mid}`;
  const map = {};
  for (const r of readings) map[key(r.sessionId, r.markerId)] = r.value;
  const markerById = Object.fromEntries(markers.map((m) => [m.id, m]));

  const cellVal = (sid, mid) => map[key(sid, mid)];

  async function exportCsv() {
    const res = await saveFile(
      `측정이력_${safeName(item.partNo || 'item')}.csv`,
      historyCsv(item, markers, sessions, cellVal),
      'text/csv;charset=utf-8'
    );
    toast(res.target === 'folder' ? `${res.dir} 폴더에 저장했습니다` : 'CSV를 내려받았습니다');
  }

  function printReport() {
    if (!openPrint(historyReportHtml(item, markers, sessions, cellVal))) {
      toast('팝업이 차단되어 인쇄창을 열 수 없습니다');
    }
  }

  const sessionNg = (sid) =>
    markers.reduce((n, m) => n + (judge(markerById[m.id], cellVal(sid, m.id)) === 'NG' ? 1 : 0), 0);

  const totalNg = sessions.reduce((n, s) => n + sessionNg(s.id), 0);
  const latest = sessions[sessions.length - 1];
  const subtitle = `측정 ${sessions.length}회` +
    (latest ? ` · 최근 ${latest.weekKey || latest.date || ''}` : '') +
    (totalNg ? ` · NG ${totalNg}건` : '');

  return (
    <CollapsePanel
      title="측정 이력 · 번호 × 주차"
      subtitle={subtitle}
      actions={
        <div className="btn-row">
          <button className="btn sm" onClick={exportCsv}>CSV 저장</button>
          <button className="btn sm" onClick={printReport}>인쇄 / PDF</button>
        </div>
      }
    >
      <p className="hint">셀 색: <span className="cell-ok">초록 OK</span> · <span className="cell-ng">빨강 NG</span>. 값은 측정값입니다.</p>

      <div className="table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2 }}>No</th>
              <th>치수 이름</th>
              <th className="num">기준</th>
              <th>단위</th>
              <th>계측기</th>
              <th className="num">공차</th>
              {sessions.map((s) => (
                <th key={s.id} className="num hist-col">
                  <div className="hist-week">{s.weekKey || '-'}</div>
                  <div className="hist-sub">{s.date || ''}{s.time ? ` ${s.time}` : ''}</div>
                  <div className="hist-sub">{s.inspector || '측정자 미기재'}</div>
                  {sessionNg(s.id) > 0 && <span className="pill-ng" style={{ marginTop: 2, display: 'inline-block' }}>{sessionNg(s.id)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const lim = limitsOf(m);
              return (
                <tr key={m.id}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}><b>{m.no}</b></td>
                  <td className="muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name || '-'}</td>
                  <td className="num">{fmt(m.nominal)}</td>
                  <td className="muted nowrap">{m.unit || 'mm'}</td>
                  <td className="muted nowrap" title={m.gauge || ''} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.gauge || '-'}</td>
                  <td className="num nowrap">
                    {tolText(m)}
                    {lim && <div className="muted" style={{ fontSize: 11 }}>{fmt(lim.lo)}~{fmt(lim.hi)}</div>}
                  </td>
                  {sessions.map((s) => {
                    const v = cellVal(s.id, m.id);
                    const j = judge(m, v);
                    return (
                      <td key={s.id} className={`num ${j === 'OK' ? 'cell-ok' : j === 'NG' ? 'cell-ng' : ''}`}
                          style={j === 'NG' ? { background: 'var(--ng-bg)' } : j === 'OK' ? { background: 'var(--ok-bg)' } : undefined}>
                        {v == null || v === '' ? '·' : fmt(v, 4)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsePanel>
  );
}
