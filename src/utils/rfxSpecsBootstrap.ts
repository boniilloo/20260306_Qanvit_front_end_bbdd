/** SessionStorage backup for initial agent prompt when navigating Home → specs */
export function rfxSpecsBootstrapStorageKey(rfxId: string): string {
  return `rfx-specs-bootstrap:${rfxId}`;
}

export interface RfxSpecsBootstrapPayload {
  initialAgentPrompt: string;
}

export function readRfxSpecsBootstrapFromStorage(rfxId: string): string | null {
  try {
    const raw = sessionStorage.getItem(rfxSpecsBootstrapStorageKey(rfxId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RfxSpecsBootstrapPayload;
    const p = parsed?.initialAgentPrompt;
    return typeof p === 'string' && p.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

export function writeRfxSpecsBootstrapToStorage(rfxId: string, initialAgentPrompt: string): void {
  try {
    const payload: RfxSpecsBootstrapPayload = { initialAgentPrompt };
    sessionStorage.setItem(rfxSpecsBootstrapStorageKey(rfxId), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearRfxSpecsBootstrapStorage(rfxId: string): void {
  try {
    sessionStorage.removeItem(rfxSpecsBootstrapStorageKey(rfxId));
  } catch {
    // ignore
  }
}
