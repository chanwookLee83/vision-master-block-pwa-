import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { Crumbs } from '../components/ui.jsx';
import DrawingsTab from './tabs/DrawingsTab.jsx';
import MarkersTab from './tabs/MarkersTab.jsx';
import SessionsTab from './tabs/SessionsTab.jsx';
import HistoryTab from './tabs/HistoryTab.jsx';
import CpkTab from './tabs/CpkTab.jsx';
import AppraiserTab from './tabs/AppraiserTab.jsx';

const TABS = [
  ['drawings', '도면 · 번호 지정'],
  ['markers', '치수표'],
  ['sessions', '주간 측정'],
  ['history', '측정 이력'],
  ['cpk', '공정능력(Cpk)'],
  ['appraiser', '측정자 비교']
];

export default function ItemDetail() {
  const { id } = useParams();
  const itemId = Number(id);
  const nav = useNavigate();
  const [tab, setTab] = useState('drawings');

  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const markerCount = useLiveQuery(() => db.markers.where('itemId').equals(itemId).count(), [itemId]);

  if (item === undefined) return null;
  if (!item) return <div className="panel">품목을 찾을 수 없습니다. <Link to="/">홈으로</Link></div>;

  return (
    <>
      <Crumbs trail={[{ label: '품목', to: '/' }, { label: `${item.partNo || '품번?'} (${item.machineNo || '호기?'})` }]} />

      <div className="panel">
        <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>
              {item.partNo || '(품번 미입력)'} <span className="badge">{item.machineNo || '호기 미입력'}</span>
            </h2>
            <div className="muted">{item.partName || '(품명 미입력)'}</div>
            {item.note && <div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.note}</div>}
          </div>
          <button className="btn sm" onClick={() => nav(`/items/${id}/edit`)}>정보 수정</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}{k === 'markers' && markerCount ? ` (${markerCount})` : ''}
          </button>
        ))}
      </div>

      {tab === 'drawings' && <DrawingsTab itemId={itemId} onComplete={() => setTab('markers')} />}
      {tab === 'markers' && <MarkersTab itemId={itemId} />}
      {tab === 'sessions' && <SessionsTab itemId={itemId} />}
      {tab === 'history' && <HistoryTab itemId={itemId} />}
      {tab === 'cpk' && <CpkTab itemId={itemId} />}
      {tab === 'appraiser' && <AppraiserTab itemId={itemId} />}
    </>
  );
}
