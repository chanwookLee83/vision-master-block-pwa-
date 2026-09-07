import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { downloadBackup, importAll } from '../lib/backup.js';
import { Empty, useToast } from '../components/ui.jsx';

export default function ItemList() {
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);
  const [q, setQ] = useState('');

  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []);
  const drawings = useLiveQuery(() => db.drawings.toArray(), []);
  const markers = useLiveQuery(() => db.markers.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items || [];
    return (items || []).filter((it) =>
      [it.partNo, it.partName, it.machineNo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [items, q]);

  if (!items) return null;

  const thumbOf = (id) => (drawings || []).find((d) => d.itemId === id)?.dataUrl;
  const markerCount = (id) => (markers || []).filter((m) => m.itemId === id).length;
  const sessionCount = (id) => (sessions || []).filter((s) => s.itemId === id).length;

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const mode = confirm('기존 데이터를 모두 지우고 이 백업으로 교체할까요?\n\n[확인] = 교체   [취소] = 기존 데이터에 병합') ? 'replace' : 'merge';
    try {
      await importAll(text, mode);
      toast(mode === 'replace' ? '백업으로 교체했습니다' : '백업을 병합했습니다');
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>품목 ({q.trim() ? `${filtered.length}/${items.length}` : items.length})</h2>
          <div className="btn-row">
            <button className="btn sm" onClick={downloadBackup}>백업 내보내기</button>
            <button className="btn sm" onClick={() => fileRef.current.click()}>가져오기</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
          </div>
        </div>
        {items.length > 0 && (
          <div className="search-box" style={{ marginTop: 12 }}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="품번 · 품명 · 호기 검색"
              aria-label="품목 검색"
            />
            {q && <button className="btn sm ghost" onClick={() => setQ('')}>지우기</button>}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="panel">
          <Empty title="등록된 품목이 없습니다">
            품번 · 품명 · 호기를 등록하고 도면을 올려 번호를 지정하세요.
          </Empty>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <Empty title="검색 결과가 없습니다">
            &lsquo;{q}&rsquo; 와(과) 일치하는 품번 · 품명 · 호기가 없습니다.
          </Empty>
        </div>
      ) : (
        <div>
          {filtered.map((it) => (
            <div key={it.id} className="item-card" onClick={() => nav(`/items/${it.id}`)}>
              {thumbOf(it.id) ? (
                <img className="thumb" src={thumbOf(it.id)} alt="" />
              ) : (
                <div className="thumb" />
              )}
              <div className="meta">
                <div className="no">
                  {it.partNo || '(품번 미입력)'} <span className="badge gray">{it.machineNo || '호기?'}</span>
                </div>
                <div className="sub">{it.partName || '(품명 미입력)'}</div>
                <div className="sub">
                  치수 {markerCount(it.id)}개 · 측정 {sessionCount(it.id)}회
                </div>
              </div>
              <span className="btn sm ghost">›</span>
            </div>
          ))}
        </div>
      )}

      <button className="fab" onClick={() => nav('/items/new')}>+ 품목 등록</button>
    </>
  );
}
