import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, createItem, updateItem, deleteItem } from '../lib/db.js';
import { requireAdmin } from '../lib/admin.js';
import { Crumbs, useToast } from '../components/ui.jsx';

const EMPTY = { partNo: '', partName: '', machineNo: '', note: '' };

export default function ItemForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!editing) return;
    db.items.get(Number(id)).then((it) => {
      if (it) setForm({ partNo: it.partNo, partName: it.partName, machineNo: it.machineNo, note: it.note || '' });
      setLoaded(true);
    });
  }, [id, editing]);

  if (!loaded) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.partNo.trim()) return toast('품번을 입력하세요');
    if (editing) {
      await updateItem(Number(id), form);
      toast('저장했습니다');
      nav(`/items/${id}`);
    } else {
      const newId = await createItem(form);
      toast('품목을 등록했습니다');
      nav(`/items/${newId}`);
    }
  }

  async function remove() {
    if (!(await requireAdmin('품목 삭제'))) return;
    if (!confirm('이 품목과 모든 도면·치수·측정 이력을 삭제합니다. 계속할까요?')) return;
    await deleteItem(Number(id));
    toast('삭제했습니다');
    nav('/');
  }

  return (
    <>
      <Crumbs trail={[{ label: '품목', to: '/' }, { label: editing ? '수정' : '신규 등록' }]} />
      <form className="panel" onSubmit={save}>
        <h2>{editing ? '품목 정보 수정' : '품목 등록'}</h2>
        <div className="grid cols-2">
          <label className="field">
            <span>품번 *</span>
            <input value={form.partNo} onChange={set('partNo')} placeholder="예: MB-5-VISION" autoFocus />
          </label>
          <label className="field">
            <span>호기</span>
            <input value={form.machineNo} onChange={set('machineNo')} placeholder="예: 5호기" />
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>품명</span>
          <input value={form.partName} onChange={set('partName')} placeholder="예: Master Block Vision" />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>비고</span>
          <textarea value={form.note} onChange={set('note')} placeholder="Hole 간 거리 공차 ±0.02 등" />
        </label>
        <div className="divider" />
        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <div className="btn-row">
            <button type="submit" className="btn primary">{editing ? '저장' : '등록'}</button>
            <button type="button" className="btn" onClick={() => nav(-1)}>취소</button>
          </div>
          {editing && <button type="button" className="btn danger" onClick={remove}>품목 삭제</button>}
        </div>
      </form>
    </>
  );
}
