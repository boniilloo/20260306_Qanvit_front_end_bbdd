/**
 * Unify Spanish (`empresa`/`producto`) and English (`company_name`/`product_name`)
 * keys from API responses, WebSocket payloads, or persisted evaluation/selection rows.
 */
export function normalizeBestMatchRow(m: any): any {
  if (!m || typeof m !== 'object') return m;
  const str = (v: unknown): string => {
    if (typeof v === 'string') return v.trim();
    if (v == null) return '';
    return String(v).trim();
  };
  const empresa =
    str(m.empresa) || str((m as any).company_name) || str((m as any).nombre_empresa) || '';
  const producto = str(m.producto) || str((m as any).product_name) || '';
  return { ...m, empresa, producto };
}
