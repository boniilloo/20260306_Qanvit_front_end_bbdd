import React from 'react';

interface ScoreDonutProps {
  // Score 0-100. Si es null/undefined, se pinta apagado y muestra "—".
  value: number | null | undefined;
  size?: number;
  // Etiqueta en mini-caps debajo del número (ej: "MATCH"). Opcional.
  label?: string;
}

const ScoreDonut: React.FC<ScoreDonutProps> = ({ value, size = 44, label }) => {
  const hasValue = typeof value === 'number' && value > 0;
  const pct = hasValue ? Math.min(100, Math.max(0, value)) : 0;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div
      className="relative shrink-0 flex flex-col items-center"
      style={{ width: size, height: size }}
      aria-label={label ? `${label} ${Math.round(pct)}` : `${Math.round(pct)}`}
    >
      <svg width={size} height={size} className="block -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f1e8f4"
          strokeWidth={stroke}
        />
        {hasValue && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#22183a"
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span
        className="absolute inset-0 grid place-items-center text-[13px] font-semibold text-[#22183a] tabular-nums leading-none"
      >
        {hasValue ? Math.round(pct) : '—'}
      </span>
      {label && (
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-wider text-gray-500 whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
};

export default ScoreDonut;
