import { ReactNode, useEffect, useState } from "react";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function TopBar({ onBack, title, right }: { onBack?: () => void; title: string; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Back">←</button> : <span style={{ width: 44 }} />}
      <span className="label">{title}</span>
      {right ?? <span style={{ width: 44 }} />}
    </div>
  );
}

// ---- toast ----
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
export const toast = (msg: string) => listeners.forEach((l) => l(msg));
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const l: Listener = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600); };
    listeners.add(l); return () => { listeners.delete(l); };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}
