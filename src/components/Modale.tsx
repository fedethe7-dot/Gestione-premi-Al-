import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

export function Modale({ titolo, chiudi, children, larghezza = 'max-w-2xl', laterale = false }: {
  titolo: ReactNode; chiudi: () => void; children: ReactNode; larghezza?: string; laterale?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chiudiRef = useRef(chiudi);
  chiudiRef.current = chiudi;
  useEffect(() => {
    const prima = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Esc chiude solo la finestra più in alto e non quando un menu a tendina è aperto.
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tutte = document.querySelectorAll('[role=dialog]');
      if (tutte[tutte.length - 1] !== ref.current) return;
      e.stopPropagation(); chiudiRef.current();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      if (!ref.current?.contains(document.activeElement)) {
        const f = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), select, textarea, button[type=submit]');
        f?.focus();
      }
    }, 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); prima?.focus?.(); };
  }, []);
  return (
    <div className={`fixed inset-0 z-40 flex bg-slate-900/40 ${laterale ? 'justify-end' : 'items-start justify-center overflow-y-auto p-4 pt-[8vh]'}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) chiudi(); }}>
      <div ref={ref} role="dialog" aria-modal="true"
        className={`w-full ${larghezza} bg-white shadow-xl ${laterale ? 'flex h-full flex-col' : 'rounded-xl'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{titolo}</h2>
          <button className="btn-testo px-1.5" onClick={chiudi} aria-label="Chiudi"><LuX size={18} /></button>
        </div>
        <div className={`px-5 py-4 ${laterale ? 'flex-1 overflow-y-auto' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
