import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LocateFixed } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AskFQAgentScope =
  | {
      global: true; // always true (locked)
      /**
       * Deprecated (temporarily hidden in UI): country filter.
       * Kept for backward compatibility with older messages.
       */
      country?: { countries: Array<{ countryCode: string; countryName: string }> };
      /** Selected location + (optional) radius for "nearby" mode */
      nearby?: { lat: number; lng: number; radius_km?: number };
      /** UI mode hint (non-breaking for backend) */
      mode?: 'global' | 'nearby';
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

    const target = value ?? center;
    const zoom = value ? Math.max(map.getZoom?.() || 2, 6) : 2;
    map.setView([target.lat, target.lng], zoom, { animate: true });

    if (value) {
      if (!markerRef.current) {
        markerRef.current = L.marker([value.lat, value.lng]).addTo(map);
      } else {
        markerRef.current.setLatLng([value.lat, value.lng]);
      }

      // Radius circle overlay (meters)
      const radiusMeters = Math.max(100, radiusKm) * 1000;
      if (!circleRef.current) {
        circleRef.current = L.circle([value.lat, value.lng], {
          radius: radiusMeters,
          color: '#f4a9aa',
          weight: 2,
          opacity: 0.9,
          fillColor: '#f4a9aa',
          fillOpacity: 0.18,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([value.lat, value.lng]);
        circleRef.current.setRadius(radiusMeters);
      }

      // Keep the selected radius visible
      try {
        map.fitBounds(circleRef.current.getBounds(), { padding: [18, 18], maxZoom: 10, animate: true });
      } catch {
        // ignore
      }
    } else if (markerRef.current) {
      markerRef.current.remove?.();
      markerRef.current = null;
    }

    if (!value && circleRef.current) {
      circleRef.current.remove?.();
      circleRef.current = null;
    }
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
  const [mode, setMode] = useState<'global' | 'nearby'>('global');
  const [radiusKm, setRadiusKm] = useState<number>(300);

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });

  useEffect(() => {
    if (!open) return;
    // Reset to required defaults each time it opens.
    setMode('global');
    setRadiusKm(300);
    setPicked(null);
    setMapCenter({ lat: 20, lng: 0 });
  }, [open]);

  const canConfirm = mode === 'global' || !!picked;

  const handleConfirm = () => {
    const scope: AskFQAgentScope = { global: true, mode };
    if (mode === 'nearby' && picked) {
      scope.nearby = { lat: picked.lat, lng: picked.lng, radius_km: radiusKm };
    }
    return onConfirm(scope);
  };

  const useMyLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMode('nearby');
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
          <DialogTitle className="text-[#22183a]">Where should Qanvit look for candidates?</DialogTitle>
          <DialogDescription>
            Choose the geographic scope for the search. Default is global.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="grid gap-3">
              {/* Global */}
              <label
                htmlFor="ask-fq-scope-global"
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 cursor-pointer',
                  mode === 'global' ? 'border-[#f4a9aa] bg-[#f4a9aa]/10' : 'border-gray-200 bg-white'
                )}
              >
                <RadioGroupItem id="ask-fq-scope-global" value="global" className="mt-1" />
                <div className="space-y-1">
                  <div className="text-base font-semibold text-[#22183a]">Globally</div>
                  <p className="text-sm text-gray-600">Best matches anywhere in the Qanvit database.</p>
                </div>
              </label>

              {/* Nearby */}
              <label
                htmlFor="ask-fq-scope-nearby"
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 cursor-pointer',
                  mode === 'nearby' ? 'border-[#f4a9aa] bg-[#f4a9aa]/10' : 'border-gray-200 bg-white'
                )}
              >
                <RadioGroupItem id="ask-fq-scope-nearby" value="nearby" className="mt-1" />
                <div className="space-y-3 w-full">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-[#22183a]">Near a location</div>
                    <p className="text-sm text-gray-600">
                      Choose a point and a radius — we’ll prioritize suppliers within that area.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-white"
                      onClick={() => {
                        setMode('nearby');
                        void useMyLocation();
                      }}
                    >
                      <LocateFixed className="h-4 w-4 mr-2" />
                      Use my location
                    </Button>
                    <p className="text-sm text-gray-600">…or click on the map to set a point.</p>
                  </div>

                  {mode === 'nearby' && (
                    <div className="rounded-lg overflow-hidden border border-gray-200">
                      <div className="h-72 w-full">
                        <FixLeafletDefaultIcons />
                        <LeafletLocationPicker
                          open={open && mode === 'nearby'}
                          center={mapCenter}
                          value={picked}
                          radiusKm={radiusKm}
                          onPick={(lat, lng) => {
                            setMode('nearby');
                            setPicked({ lat, lng });
                            setMapCenter({ lat, lng });
                          }}
                        />
                      </div>

                      <div className="px-3 py-3 bg-white space-y-3">
                        <div className="text-xs text-gray-600 flex items-center justify-between">
                          <span>
                            {picked
                              ? `Selected: ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
                              : 'No point selected yet'}
                          </span>
                          {picked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setPicked(null)}
                              className="text-gray-600"
                            >
                              Clear
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm text-[#22183a]">Radius</Label>
                            <span className="text-sm font-semibold text-[#22183a]">{radiusKm} km</span>
                          </div>
                          <input
                            type="range"
                            min={100}
                            max={1500}
                            step={50}
                            value={radiusKm}
                            onChange={(e) => setRadiusKm(Number(e.target.value))}
                            className="w-full accent-[#f4a9aa]"
                          />
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>100 km</span>
                            <span>1500 km</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-navy hover:bg-navy/90 text-white disabled:opacity-50"
            >
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


