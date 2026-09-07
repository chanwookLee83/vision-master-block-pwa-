import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 자유 입력 + 자동완성 목록(datalist).
 * props: value, onChange(string), options: string[], 나머지는 input 으로 전달.
 */
export function ListInput({ value, onChange, options = [], ...props }) {
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        {...props}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

/**
 * 리스트 박스(select) + "직접 입력…" 옵션.
 * props: value, onChange(string), options: string[], labelOf(o)=>표시문자열,
 *        promptText(직접 입력 시 프롬프트 문구), 나머지는 select 로 전달.
 */
export function SelectInput({ value, onChange, options = [], labelOf = (o) => o, promptText = '직접 입력', ...props }) {
  const CUSTOM = '__custom__';
  // 목록에 없는 현재 값은 맨 앞에 끼워 넣어 보이게 한다.
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CUSTOM) {
          const t = window.prompt(promptText, value || '');
          if (t && t.trim()) onChange(t.trim());
          return;
        }
        onChange(v);
      }}
      {...props}
    >
      {!value && <option value="" disabled>(선택)</option>}
      {opts.map((o) => <option key={o} value={o}>{labelOf(o)}</option>)}
      <option value={CUSTOM}>+ 직접 입력…</option>
    </select>
  );
}

/**
 * 소수점 입력용 컨트롤드 인풋.
 * type=number 는 "27." 같은 입력 중간 상태에서 value 가 빈 문자열이 되어
 * 컨트롤드+숫자 저장과 함께 쓰면 글자가 씹힌다. 여기서는 표시용 문자열을
 * 로컬 state 로 들고, 파싱된 숫자(또는 null)만 밖으로 넘긴다.
 */
export function DecimalInput({ value, onChange, allowNegative = true, ...props }) {
  const [text, setText] = useState(value == null || value === '' ? '' : String(value));
  const external = useRef(value);

  useEffect(() => {
    if (value === external.current) return;
    external.current = value;
    const cur = text === '' ? null : Number(text);
    if (cur !== value) setText(value == null || value === '' ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.trim();
        if (t !== '' && !re.test(t)) return;
        setText(t);
        external.current = t === '' || t === '-' || t === '.' || t === '-.' ? null : Number(t);
        onChange(external.current);
      }}
      {...props}
    />
  );
}

/**
 * 접이식 패널. 기본은 접힌 상태.
 * props: title, subtitle, defaultOpen, actions(펼쳤을 때만 헤더 우측에 표시), children
 */
export function CollapsePanel({ title, subtitle, defaultOpen = false, actions, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`panel collapse ${open ? 'open' : ''}`}>
      <div className="collapse-head">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="chev" aria-hidden>▸</span>
          <span className="collapse-title">{title}</span>
          {subtitle && <span className="collapse-sub muted">{subtitle}</span>}
        </button>
        {open && actions}
      </div>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const toast = useCallback((text) => {
    setMsg(text);
    clearTimeout(window.__vmbToast);
    window.__vmbToast = setTimeout(() => setMsg(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export function Crumbs({ trail }) {
  return (
    <div className="crumbs">
      {trail.map((c, i) => (
        <span key={i}>
          {i > 0 && <span> / </span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
        </span>
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="7" width="18" height="10" rx="1" />
        <circle cx="8" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="16" cy="12" r="1" fill="currentColor" />
        <path d="M4 4h16M4 3v3M20 3v3" />
      </svg>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{title}</p>
      <div>{children}</div>
    </div>
  );
}

// 파일 → 다운스케일된 dataURL + 크기
export function readImageFile(file, maxDim = 2000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // 투명 PNG 도 흰 바탕으로 (도면 배경/‌OCR 일관성)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // 도면의 얇은 검은 치수선·치수문자가 JPEG 색번짐으로 보라/초록빛이
        // 되지 않도록 무손실 PNG 로 저장한다. 사진처럼 PNG 가 너무 커질 때만
        // 고품질 JPEG 로 대체한다.
        let dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length > 4500000) dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        resolve({ dataUrl, w: width, h: height });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
