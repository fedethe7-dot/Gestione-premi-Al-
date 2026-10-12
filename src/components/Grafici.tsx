import { useEffect, useRef, useState } from 'react';
import { meseIt, num } from '../lib/format.ts';
import type { PuntoMensile } from '../lib/statistiche.ts';

export const COLORE_TRASF = 'var(--color-serie-trasf)';
export const COLORE_RESO = 'var(--color-serie-reso)';

export function Legenda() {
  return (
    <div className="flex gap-4 text-sm text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORE_TRASF }} />Quantità trasferita</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORE_RESO }} />Quantità resa</span>
    </div>
  );
}

function scala(max: number): number[] {
  if (max <= 0) return [0, 1];
  const grezzo = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= grezzo) ?? grezzo;
  const tacche = [];
  for (let v = 0; v <= max + passo * 0.001; v += passo) tacche.push(Math.round(v));
  if (tacche[tacche.length - 1] < max) tacche.push(Math.round(tacche[tacche.length - 1] + passo));
  return tacche;
}

/** Barre affiancate per mese: quantità trasferita e quantità resa (stessa unità: pezzi). */
export function GraficoMensile({ dati }: { dati: PuntoMensile[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const [larghezza, setLarghezza] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarghezza(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dati.length > 0]);
  if (!dati.length) return <p className="py-8 text-center text-slate-500">Nessun movimento nel periodo selezionato.</p>;
  const H = 240, L = 44, R = 8, T = 10, B = 28;
  // Il grafico usa la larghezza reale del contenitore: testi sempre a 11px; con molti mesi scorre in orizzontale.
  const W = Math.max(larghezza, dati.length * 40 + L + R);
  const tacche = scala(Math.max(...dati.map((d) => Math.max(d.qTrasf, d.qResi))));
  const max = tacche[tacche.length - 1];
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const slot = (W - L - R) / dati.length;
  const bw = Math.min(18, (slot - 10) / 2);
  const ogni = Math.ceil(dati.length / 14);
  const h = hover !== null ? dati[hover] : null;

  return (
    <div className="relative overflow-x-auto" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Andamento mensile delle quantità trasferite e rese">
        {tacche.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{num(t)}</text>
          </g>
        ))}
        {dati.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          const barra = (v: number, x: number, colore: string) => {
            if (v <= 0) return null;
            const r = Math.min(4, y(0) - y(v), bw / 2);
            return <path d={`M${x},${y(0)} V${y(v) + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${y(0)} Z`} fill={colore} />;
          };
          return (
            <g key={d.mese} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {barra(d.qTrasf, cx - bw - 1, COLORE_TRASF)}
              {barra(d.qResi, cx + 1, COLORE_RESO)}
              {i % ogni === 0 && <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="#475569">{meseIt(d.mese)}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(W - 120, Math.max(100, L + slot * (hover + 0.5))), transform: 'translateX(-50%)' }}>
          <div className="font-semibold">{meseIt(h.mese)}</div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLORE_TRASF }} />Trasferiti: <b>{num(h.qTrasf)}</b> pz ({h.nTrasf} op.)</div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLORE_RESO }} />Resi: <b>{num(h.qResi)}</b> pz ({h.nResi} op.)</div>
        </div>
      )}
    </div>
  );
}
