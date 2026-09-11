import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import FolderReconnectBar from './components/FolderReconnectBar.jsx';
import ItemList from './pages/ItemList.jsx';
import ItemForm from './pages/ItemForm.jsx';
import ItemDetail from './pages/ItemDetail.jsx';
import MeasureEntry from './pages/MeasureEntry.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const nav = useNavigate();
  return (
    <ToastProvider>
      <div className="topbar">
        <Link to="/" className="brand">
          <span className="brand-emoji" aria-hidden>📐</span>
          <span>측정관리 이력관리 시스템</span>
        </Link>
        <span className="spacer" />
        <button className="btn sm" onClick={() => nav('/')}>품목 목록</button>
        <button className="btn sm" onClick={() => nav('/settings')}>설정</button>
      </div>
      <div className="app">
        <Routes>
          <Route path="/" element={<ItemList />} />
          <Route path="/items/new" element={<ItemForm />} />
          <Route path="/items/:id/edit" element={<ItemForm />} />
          <Route path="/items/:id" element={<ItemDetail />} />
          <Route path="/items/:id/measure/:sessionId" element={<MeasureEntry />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="panel">페이지를 찾을 수 없습니다. <Link to="/">홈으로</Link></div>} />
        </Routes>
      </div>
      <FolderReconnectBar />
      <UpdatePrompt />
    </ToastProvider>
  );
}
