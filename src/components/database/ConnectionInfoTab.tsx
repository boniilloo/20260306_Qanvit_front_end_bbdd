import React, { useMemo } from 'react';

const maskKey = (key: string | undefined) => {
  if (!key) return '';
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
};

const getProjectRefFromUrl = (url: string | undefined) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname; // e.g. fukzxedgbszcpakqkrjf.supabase.co
    const [sub] = host.split('.');
    return host.endsWith('supabase.co') ? sub : '';
  } catch {
    return '';
  }
};

const ConnectionInfoTab: React.FC = () => {
  const isLocal = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';

  const localUrl = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  const localAnon = import.meta.env.VITE_SUPABASE_LOCAL_ANON_KEY || 'sb_publishable_…';

  // Use same fallbacks as the Supabase client so info is visible even without envs
  const remoteUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fukzxedgbszcpakqkrjf.supabase.co';
  const remoteAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1a3p4ZWRnYnN6Y3Bha3FrcmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0MzIzMDQsImV4cCI6MjA2NjAwODMwNH0.sz4lyS_ljaJyFsxD0TKxcDTTDm0ovVg_uIAfilG6-GA';

  const effectiveUrl = isLocal ? localUrl : remoteUrl;
  const effectiveKey = isLocal ? localAnon : remoteAnon;

  const projectRef = useMemo(() => (isLocal ? 'local' : getProjectRefFromUrl(remoteUrl)), [isLocal, remoteUrl]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-xl font-semibold mb-2">Current database connection</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Mode</div>
            <div className="font-medium">{isLocal ? 'Local (Docker)' : 'Remote (Supabase Cloud)'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">API URL</div>
            <div className="font-mono break-all">{effectiveUrl || '—'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Project Ref</div>
            <div className="font-mono">{projectRef || '—'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Anon/Publishable Key</div>
            <div className="font-mono">{maskKey(effectiveKey)}</div>
          </div>
          {isLocal && (
            <div>
              <div className="text-sm text-gray-500">Local Postgres</div>
              <div className="font-mono">postgresql://postgres:postgres@127.0.0.1:54322/postgres</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-base font-semibold mb-2">How to switch</h3>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          <li>Toggle with <span className="font-mono">VITE_USE_LOCAL_SUPABASE</span> (true → local, false → remote).</li>
          <li>Local overrides: <span className="font-mono">VITE_SUPABASE_LOCAL_URL</span>, <span className="font-mono">VITE_SUPABASE_LOCAL_ANON_KEY</span>.</li>
          <li>Remote vars: <span className="font-mono">VITE_SUPABASE_URL</span>, <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>.</li>
        </ul>
      </div>
    </div>
  );
};

export default ConnectionInfoTab;


