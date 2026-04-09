import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const DEFAULT_SCOPE_LOCATION = { lat: 40.4210, lng: -3.7022 }; // Default point (Madrid area)
const DEFAULT_SCOPE_RADIUS_KM = 650;
const MIN_SCOPE_RADIUS_KM = 100;
const MAX_SCOPE_RADIUS_KM = 2500;

export type AskFQAgentScope = {
  nearby: { lat: number; lng: number; radius_km: number };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: AskFQAgentScope) => void;
};

function FixLeafletDefaultIcons() {
  useEffect(() => {
    // Ensure default marker icons work in bundlers.
    (async () => {
      const L = (await import('leaflet')).default as any;
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
    })();
  }, []);
  return null;
}

function LeafletLocationPicker({
  open,
  center,
  value,
  radiusKm,
  onPick,
}: {
  open: boolean;
  center: { lat: number; lng: number };
  value: { lat: number; lng: number } | null;
  radiusKm: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  const syncMapSelection = (
    map: any,
    L: any,
    selectedValue: { lat: number; lng: number } | null,
    fallbackCenter: { lat: number; lng: number },
    currentRadiusKm: number
  ) => {
    const target = selectedValue ?? fallbackCenter;
    const zoom = selectedValue ? 6 : 2;
    map.setView([target.lat, target.lng], zoom, { animate: true });

    if (selectedValue) {
      if (!markerRef.current) {
        markerRef.current = L.marker([selectedValue.lat, selectedValue.lng]).addTo(map);
      } else {
        markerRef.current.setLatLng([selectedValue.lat, selectedValue.lng]);
      }

      const radiusMeters = Math.max(100, currentRadiusKm) * 1000;
      if (!circleRef.current) {
        circleRef.current = L.circle([selectedValue.lat, selectedValue.lng], {
          radius: radiusMeters,
          color: '#f4a9aa',
          weight: 2,
          opacity: 0.9,
          fillColor: '#f4a9aa',
          fillOpacity: 0.18,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([selectedValue.lat, selectedValue.lng]);
        circleRef.current.setRadius(radiusMeters);
      }

      try {
        map.fitBounds(circleRef.current.getBounds(), { padding: [18, 18], maxZoom: 10, animate: true });
      } catch {
        // ignore
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove?.();
        markerRef.current = null;
      }
      if (circleRef.current) {
        circleRef.current.remove?.();
        circleRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      const L = (await import('leaflet')).default as any;
      leafletRef.current = L;

      // Fix default markers
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      if (cancelled) return;
      if (!containerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(containerRef.current, { attributionControl: false }).setView([center.lat, center.lng], 2);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        map.on('click', (e: any) => {
          onPick(e.latlng.lat, e.latlng.lng);
        });

        // Draw default/current selection as soon as the map is created.
        syncMapSelection(map, L, value, center, radiusKm);
      }

      // Ensure correct sizing once dialog is visible
      window.setTimeout(() => {
        try {
          mapInstanceRef.current?.invalidateSize?.();
        } catch {
          // ignore
        }
      }, 50);
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [open, center.lat, center.lng, onPick]);

  useEffect(() => {
    if (!open) return;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    syncMapSelection(map, L, value, center, radiusKm);
  }, [open, center, value, radiusKm]);

  useEffect(() => {
    return () => {
      try {
        mapInstanceRef.current?.remove?.();
      } catch {
        // ignore
      }
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default function AskFQAgentScopeModal({ open, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation();
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_SCOPE_RADIUS_KM);

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(DEFAULT_SCOPE_LOCATION);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(DEFAULT_SCOPE_LOCATION);

  useEffect(() => {
    if (!open) return;
    // Reset to required defaults each time it opens.
    setRadiusKm(DEFAULT_SCOPE_RADIUS_KM);
    setPicked(DEFAULT_SCOPE_LOCATION);
    setMapCenter(DEFAULT_SCOPE_LOCATION);
  }, [open]);

  const canConfirm = !!picked;

  const handleConfirm = () => {
    if (!picked) return;
    return onConfirm({
      nearby: { lat: picked.lat, lng: picked.lng, radius_km: radiusKm },
    });
  };

  const pickMyLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPicked(next);
        setMapCenter(next);
      },
      () => {
        // ignore errors (permission denied, etc.)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[#22183a]">{t('rfxs.scopeModal_title')}</DialogTitle>
          <DialogDescription>
            {t('rfxs.scopeModal_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3">
            <div className="rounded-lg border border-[#f4a9aa] bg-[#f4a9aa]/10 p-4">
              <div className="space-y-3 w-full">
                <div className="space-y-1">
                  <div className="text-base font-semibold text-[#22183a]">{t('rfxs.scopeModal_nearLocation')}</div>
                  <p className="text-sm text-gray-600">{t('rfxs.scopeModal_nearLocationDesc')}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" className="bg-white" onClick={() => void pickMyLocation()}>
                    <LocateFixed className="h-4 w-4 mr-2" />
                    {t('rfxs.scopeModal_useMyLocation')}
                  </Button>
                  <p className="text-sm text-gray-600">{t('rfxs.scopeModal_clickMapHint')}</p>
                </div>

                <div className="rounded-lg overflow-hidden border border-gray-200">
                  <div className="h-72 w-full">
                    <FixLeafletDefaultIcons />
                    <LeafletLocationPicker
                      open={open}
                      center={mapCenter}
                      value={picked}
                      radiusKm={radiusKm}
                      onPick={(lat, lng) => {
                        setPicked({ lat, lng });
                        setMapCenter({ lat, lng });
                      }}
                    />
                  </div>

                  <div className="px-3 py-3 bg-white space-y-3">
                    <div className="text-xs text-gray-600 flex items-center justify-between">
                      <span>
                        {picked
                          ? t('rfxs.scopeModal_selectedPoint', { lat: picked.lat.toFixed(5), lng: picked.lng.toFixed(5) })
                          : t('rfxs.scopeModal_noPointYet')}
                      </span>
                      {picked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPicked(null)}
                          className="text-gray-600"
                        >
                          {t('rfxs.scopeModal_clear')}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-[#22183a]">{t('rfxs.scopeModal_radius')}</Label>
                        <span className="text-sm font-semibold text-[#22183a]">{radiusKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={MIN_SCOPE_RADIUS_KM}
                        max={MAX_SCOPE_RADIUS_KM}
                        step={50}
                        value={radiusKm}
                        onChange={(e) => setRadiusKm(Number(e.target.value))}
                        className="w-full accent-[#f4a9aa]"
                      />
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{MIN_SCOPE_RADIUS_KM} km</span>
                        <span>{MAX_SCOPE_RADIUS_KM} km</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('rfxs.scopeModal_cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-navy hover:bg-navy/90 text-white disabled:opacity-50"
            >
              {t('rfxs.scopeModal_continue')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


