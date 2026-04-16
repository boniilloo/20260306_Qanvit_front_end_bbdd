/**
 * HTTP base URL for the same backend that serves /ws-rfx-agent (RFX conversational agent).
 * Used for REST endpoints like /api/rfxs/bootstrap-from-intent.
 */
const DEFAULT_LOCAL_RFX_AGENT_WS_URL = 'ws://localhost:8000/ws-rfx-agent';

function getConfiguredRfxAgentWsUrl(): string {
  const localUrl = String(import.meta.env.VITE_WS_RFX_AGENT_LOCAL_URL || '').trim();
  const productionUrl = String(import.meta.env.VITE_WS_RFX_AGENT_URL || '').trim();
  const resolved = import.meta.env.DEV
    ? localUrl || productionUrl || DEFAULT_LOCAL_RFX_AGENT_WS_URL
    : productionUrl;

  if (!resolved) {
    // In production we rely on env vars. Fallback only exists for local development.
    console.error(
      '[RFX URL CONFIG] Missing VITE_WS_RFX_AGENT_URL. Configure it in your deployment environment.'
    );
    return DEFAULT_LOCAL_RFX_AGENT_WS_URL;
  }
  return resolved;
}

function withWsPath(baseWsUrl: string, targetPath: string): string {
  const sanitizedTargetPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const normalizedBase = baseWsUrl.replace(/\/$/, '');
  if (/\/ws-[^/]+$/i.test(normalizedBase)) {
    return normalizedBase.replace(/\/ws-[^/]+$/i, sanitizedTargetPath);
  }
  return `${normalizedBase}${sanitizedTargetPath}`;
}

export function getRfxAgentWsUrl(): string {
  return withWsPath(getConfiguredRfxAgentWsUrl(), '/ws-rfx-agent');
}

export function getRfxCandidatesWsUrl(): string {
  return withWsPath(getConfiguredRfxAgentWsUrl(), '/ws-rfx-candidates');
}

export function getRfxCandidatesEnrichmentWsUrl(): string {
  return withWsPath(getConfiguredRfxAgentWsUrl(), '/ws-rfx-candidates-enrichment');
}

export function getRfxLegacyCandidatesWsUrl(): string {
  return withWsPath(getConfiguredRfxAgentWsUrl(), '/ws-rfx');
}

export function getRfxAgentHttpBaseUrl(): string {
  const explicit = import.meta.env.VITE_RFX_API_HTTP_URL;
  if (explicit && String(explicit).trim()) {
    return String(explicit)
      .replace(/\/$/, '')
      .replace(/\/ws-rfx-agent\/?$/i, '')
      .replace(/\/ws-rfx-candidates\/?$/i, '')
      .replace(/\/ws-rfx-candidates-enrichment\/?$/i, '')
      .replace(/\/ws-rfx\/?$/i, '');
  }

  return getRfxAgentWsUrl()
    .replace(/^ws:\/\//i, 'http://')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/\/ws-rfx-agent\/?$/i, '');
}
