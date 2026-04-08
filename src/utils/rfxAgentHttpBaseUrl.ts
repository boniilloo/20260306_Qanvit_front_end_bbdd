/**
 * HTTP base URL for the same backend that serves /ws-rfx-agent (RFX conversational agent).
 * Used for REST endpoints like /api/rfxs/bootstrap-from-intent.
 */
export function getRfxAgentHttpBaseUrl(): string {
  const explicit = import.meta.env.VITE_RFX_API_HTTP_URL;
  if (explicit && String(explicit).trim()) {
    return String(explicit).replace(/\/$/, '');
  }

  const wsUrl = import.meta.env.DEV
    ? import.meta.env.VITE_WS_RFX_AGENT_LOCAL_URL || 'ws://localhost:8000/ws-rfx-agent'
    : import.meta.env.VITE_WS_RFX_AGENT_URL;

  if (!wsUrl || !String(wsUrl).trim()) {
    return 'http://localhost:8000';
  }

  return String(wsUrl)
    .replace(/^ws:\/\//i, 'http://')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/\/ws-rfx-agent\/?$/i, '');
}
