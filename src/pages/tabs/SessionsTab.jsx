import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createSession, deleteSession } from '../../lib/db.js';
import { judge, isoWeekKey, todayStr } from '../../lib/tol.js';
import { Empty, useToast } from '../../components/ui.jsx';

export default function SessionsTab({ itemId }) {
  const nav = useNavigate();
  const toast = useToast();

  const sessions = useLiveQuery(
    () => db.sessions.where('itemId').equals(itemId).reverse().sortBy('date'),
    [itemId]
  );
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).toArray(), [itemId]);
  const readings = useLiveQuery(() => db.readings.toArray(), []);

  if (!sessions || !markers || !readings) return null;

  const markerById = Object.fromEntries(markers.map((m) => [m.id, m]));

  function summarize(sessionId) {
    const rows = readings.filter((r) => r.sessionId === sessionId);
    const total = markers.length;
    let ok = 0, ng = 0, done = 0;
    for (const r of rows) {
      if (r.value === '' || r.value == null) continue;
      done++;
      const v = judge(markerById[r.markerId], r.value);
      if (v === 'OK') ok++;
      else if (v === 'NG') ng++;
    }
    return { ok, ng, done, total, blank: Math.max(0, total - done) };
  }

  async function newSession() {
    if (markers.length === 0) return toast('먼저 치수 번호를 지정하세요');
    const date = todayStr();
    const id = await createSession(itemId, { date, weekKey: isoWeekKey(date) });
    nav(`/items/${itemId}/measure/${id}`);
  }

  return (
    <div className="panel">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>주간 측정 ({sessions.length})</h2>
        <button className="btn primary sm" onClick={newSession}>+ 이번 주 측정 시작</button>
      </div>

      {sessions.length === 0 ? (
        <Empty title="측정 기록이 없습니다">주차별로 측정값을 입력하면 공차 대비 OK/NG가 자동 계산됩니다.</Empty>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="sess-table">
            <thead>
              <tr>
                <th>주차</th><th>측정일</th><th>시각</th><th>측정자</th>
                <th className="num">OK</th><th className="num">NG</th><th className="num">미입력</th>
                <th>진행</th><th>판정</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const sm = summarize(s.id);
                const complete = sm.total > 0 && sm.done >= sm.total;
                const inProgress = sm.done > 0 && !complete;
                return (
                  <tr key={s.id} className={sm.ng ? 'row-ng' : ''}>
                    <td><b>{s.weekKey || '-'}</b></td>
                    <td className="nowrap">{s.date || '-'}</td>
                    <td className="nowrap muted">{s.time || '-'}</td>
                    <td className="nowrap" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.inspector || ''}>{s.inspector || '-'}</td>
                    <td className="num cell-ok">{sm.ok}</td>
                    <td className="num cell-ng">{sm.ng || ''}</td>
                    <td className="num muted">{sm.blank || ''}</td>
                    <td className="nowrap">
                      <b>{sm.done}/{sm.total}</b>{' '}
                      {complete && <span className="pill-ok">완료</span>}
                      {inProgress && <span className="pill-wip">측정중</span>}
                      {sm.done === 0 && <span className="muted">시작 전</span>}
                    </td>
                    <td>{sm.ng ? <span className="pill-ng">NG</span> : sm.ok ? <span className="pill-ok">OK</span> : <span className="muted">-</span>}</td>
                    <td className="nowrap">
                      <button className="btn sm" onClick={() => nav(`/items/${itemId}/measure/${s.id}`)}>
                        {inProgress ? '이어서 측정' : '열기'}
                      </button>{' '}
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          if (!confirm(`${s.weekKey} 측정 기록을 삭제할까요?`)) return;
                          await deleteSession(s.id);
                          toast('삭제했습니다');
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
