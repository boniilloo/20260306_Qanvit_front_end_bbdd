import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { getFaviconUrl } from '@/utils/logoUtils';

export type NearbyCandidateMapItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  websiteUrl?: string | null;
  distanceKm?: number | null;
  matchPercent?: number | null;
  reasoningCandidateId?: string | null;
};

type Props = {
  candidates: NearbyCandidateMapItem[];
  selected?: { lat: number; lng: number; radiusKm?: number | null };
  heightClassName?: string;
  onOpenMatchReasoning?: (candidateId: string) => void;
  isLoading?: boolean;
};

export default function NearbyCandidatesMap({
  candidates,
  selected,
  heightClassName = 'h-80',
  onOpenMatchReasoning,
  isLoading = false,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const lastFitKeyRef = useRef<string | null>(null);

  const normalizedCandidates = useMemo(() => {
    return (candidates || []).filter((c) => {
      return (
        typeof c?.lat === 'number' &&
        typeof c?.lng === 'number' &&
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lng) &&
        c.lat >= -90 &&
        c.lat <= 90 &&
        c.lng >= -180 &&
        c.lng <= 180
      );
    });
  }, [candidates]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const L = (await import('leaflet')).default as any;
      leafletRef.current = L;

      // Fix default marker icons for bundlers
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      if (cancelled) return;
      if (!mapRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current, { attributionControl: false });
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        layerGroupRef.current = L.layerGroup().addTo(map);
        // Set a safe default view; actual bounds will be applied once we render data.
        map.setView([20, 0], 2);

        // Ensure correct sizing once visible
        window.setTimeout(() => {
          try {
            map.invalidateSize?.();
          } catch {
            // ignore
          }
        }, 50);

        setIsReady(true);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    const group = layerGroupRef.current;
    if (!map || !L || !group) return;

    group.clearLayers();

    const bounds = L.latLngBounds([]);

    // Selected point + radius
    if (selected && Number.isFinite(selected.lat) && Number.isFinite(selected.lng)) {
      const selectedMarker = L.marker([selected.lat, selected.lng]).addTo(group);
      selectedMarker.bindPopup('<strong>Selected location</strong>');
      bounds.extend([selected.lat, selected.lng]);

      const radiusKm = selected.radiusKm ?? null;
      if (typeof radiusKm === 'number' && Number.isFinite(radiusKm) && radiusKm > 0) {
        const circle = L.circle([selected.lat, selected.lng], {
          radius: radiusKm * 1000,
          color: '#80c8f0',
          weight: 2,
          opacity: 0.9,
          fillColor: '#80c8f0',
          fillOpacity: 0.14,
        }).addTo(group);
        try {
          bounds.extend(circle.getBounds());
        } catch {
          // ignore
        }
      }
    }

    // Candidate pins
    normalizedCandidates.forEach((c) => {
      const faviconUrl = getFaviconUrl(c.websiteUrl);
      const matchPercent =
        typeof c.matchPercent === 'number' && Number.isFinite(c.matchPercent) ? Math.round(c.matchPercent) : null;

      const marker = L.marker(
        [c.lat, c.lng],
        {
          icon: buildCandidateIcon(L, {
            faviconUrl,
            companyName: c.name,
            matchPercent,
          }),
        }
      ).addTo(group);
      const dist = typeof c.distanceKm === 'number' && Number.isFinite(c.distanceKm) ? Math.round(c.distanceKm) : null;
      const match = matchPercent;

      const popupLines = [
        `<strong>${escapeHtml(c.name)}</strong>`,
        dist !== null ? `Distance: ${dist} km` : null,
        match !== null ? `Match: ${match}%` : null,
      ].filter(Boolean);

      const buttonHtml = onOpenMatchReasoning
        ? `
          <div style="margin-top: 10px;">
            <button
              type="button"
              data-open-reasoning="1"
              data-candidate-id="${escapeHtml(c.reasoningCandidateId || c.id)}"
              style="
                width: 100%;
                background: #80c8f0;
                color: #1A1F2C;
                font-weight: 800;
                border: none;
                border-radius: 10px;
                padding: 8px 10px;
                cursor: pointer;
              "
            >
              See FQ Match Reasoning
            </button>
          </div>
        `
        : '';

      marker.bindPopup(`<div>${popupLines.join('<br/>')}${buttonHtml}</div>`);

      if (onOpenMatchReasoning) {
        marker.on('popupopen', (evt: any) => {
          const popupEl = evt?.popup?.getElement?.() as HTMLElement | null;
          if (!popupEl) return;
          const btn = popupEl.querySelector('button[data-open-reasoning="1"]') as HTMLButtonElement | null;
          if (!btn) return;
          btn.onclick = (e) => {
            e.preventDefault();
            const candidateId = btn.getAttribute('data-candidate-id');
            if (candidateId) onOpenMatchReasoning(candidateId);
          };
        });
      }
      bounds.extend([c.lat, c.lng]);
    });

    // View
    if (bounds.isValid()) {
      const fitKey = buildFitKey({
        selected,
        candidates: normalizedCandidates,
      });
      const shouldFit = lastFitKeyRef.current !== fitKey;
      if (shouldFit) {
        try {
          map.fitBounds(bounds, { padding: [18, 18], maxZoom: 8 });
          lastFitKeyRef.current = fitKey;
        } catch {
          // ignore
        }
      }
    } else {
      map.setView([20, 0], 2);
    }
  }, [isReady, normalizedCandidates, selected, onOpenMatchReasoning]);

  useEffect(() => {
    return () => {
      try {
        mapInstanceRef.current?.remove?.();
      } catch {
        // ignore
      }
      mapInstanceRef.current = null;
      leafletRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  return (
    <div
      className={[
        'relative z-0 isolate w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white',
        heightClassName,
      ].join(' ')}
    >
      <div ref={mapRef} className="h-full w-full" />

      {/* Legend */}
      <div className="absolute top-3 right-3 z-[500] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
        <div className="text-[11px] font-semibold text-[#1A1F2C] mb-1">Match</div>
        <div className="space-y-1 text-[11px] text-gray-700">
          <LegendRow color="#dc2626" label="< 50%" />
          <LegendRow color="#f59e0b" label="50–65%" />
          <LegendRow color="#80c8f0" label="65–80%" />
          <LegendRow color="#7de19a" label="80–100%" />
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-[450] flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="h-2 w-40 rounded bg-gray-200 animate-pulse mb-2" />
            <div className="text-sm font-semibold text-[#1A1F2C]">Generating map...</div>
            <div className="text-xs text-gray-600 mt-1">Fetching company locations from Supabase</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full border-2 bg-white"
        style={{ borderColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

function buildCandidateIcon(
  L: any,
  opts: { faviconUrl?: string | null; companyName: string; matchPercent: number | null }
) {
  const ringColor = getMatchRingColor(opts.matchPercent);
  const safeRing = escapeHtml(ringColor);
  const label = getCompanyInitial(opts.companyName);
  const safeLabel = escapeHtml(label);
  const safeUrl = opts.faviconUrl ? escapeHtml(opts.faviconUrl) : null;
  const visual = getMatchIconVisualStyle(opts.matchPercent);
  const containerSizePx = visual.containerSizePx;
  const borderPx = visual.borderPx;
  const innerSizePx = visual.innerSizePx;

  return L.divIcon({
    className: '', // remove default styles
    iconSize: [containerSizePx, containerSizePx],
    iconAnchor: [Math.round(containerSizePx / 2), containerSizePx],
    popupAnchor: [0, -Math.round(containerSizePx * 0.9)],
    html: `
      <div style="
        width: ${containerSizePx}px;
        height: ${containerSizePx}px;
        border-radius: 9999px;
        background: #ffffff;
        border: ${borderPx}px solid ${safeRing};
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      ">
        ${
          safeUrl
            ? `
              <img
                src="${safeUrl}"
                alt=""
                style="width: ${innerSizePx}px; height: ${innerSizePx}px; object-fit: contain; opacity: ${visual.opacity};"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            `
            : `
              <div style="
                width: ${Math.max(18, innerSizePx + 6)}px;
                height: ${Math.max(18, innerSizePx + 6)}px;
                border-radius: 9999px;
                background: rgba(26,31,44,0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 800;
                font-size: 14px;
                color: #1A1F2C;
                line-height: 1;
                user-select: none;
                opacity: ${visual.opacity};
              ">
                ${safeLabel}
              </div>
            `
        }
      </div>
    `,
  });
}

function getCompanyInitial(name: string) {
  const n = String(name || '').trim();
  if (!n) return '?';
  return n[0]!.toUpperCase();
}

function getMatchIconVisualStyle(matchPercent: number | null) {
  // Lower match -> smaller + more transparent. Higher match -> larger + opaque.
  if (matchPercent === null)
    return { containerSizePx: 38, borderPx: 3, innerSizePx: 18, opacity: 0.75 };
  const clamped = Math.max(0, Math.min(100, matchPercent));

  if (clamped < 50) return { containerSizePx: 25, borderPx: 3, innerSizePx: 12, opacity: 0.35 };
  if (clamped < 65) return { containerSizePx: 33, borderPx: 3, innerSizePx: 15, opacity: 0.55 };
  if (clamped < 80) return { containerSizePx: 41, borderPx: 3, innerSizePx: 18, opacity: 0.78 };
  return { containerSizePx: 50, borderPx: 4, innerSizePx: 22, opacity: 1 };
}

function getMatchRingColor(matchPercent: number | null) {
  // Discrete bands for quick ranking:
  // <50 (bad) -> strong red
  // 50-65 -> orange
  // 65-80 -> brand light-blue
  // 80-100 (best) -> brand green
  if (matchPercent === null) return 'rgba(128,200,240,0.9)'; // fallback to brand light-blue
  const clamped = Math.max(0, Math.min(100, matchPercent));

  if (clamped < 50) return '#dc2626'; // stronger red
  if (clamped < 65) return '#f59e0b'; // orange
  if (clamped < 80) return '#80c8f0'; // brand light-blue
  return '#7de19a'; // brand green
}

function escapeHtml(input: string) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildFitKey(opts: { selected?: { lat: number; lng: number; radiusKm?: number | null }; candidates: NearbyCandidateMapItem[] }) {
  const sel = opts.selected
    ? `${round6(opts.selected.lat)},${round6(opts.selected.lng)},${opts.selected.radiusKm ?? ''}`
    : 'none';
  // Only include stable bits that change map bounds.
  const pts = (opts.candidates || [])
    .map((c) => `${c.id}:${round4(c.lat)},${round4(c.lng)}`)
    .sort()
    .join('|');
  return `${sel}::${pts}`;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function round4(n: number) {
  return Math.round(n * 1e4) / 1e4;
}

