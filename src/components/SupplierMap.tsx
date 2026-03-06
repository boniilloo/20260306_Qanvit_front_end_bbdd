import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface SupplierMapProps {
  gpsCoordinates: any;
  cities: any;
  countries: any;
  companyName?: string;
  heightClass?: string;
}

const SupplierMap: React.FC<SupplierMapProps> = ({ 
  gpsCoordinates, 
  cities, 
  countries, 
  companyName,
  heightClass = 'h-64' 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const originalCenterRef = useRef<any>(null);
  const originalZoomRef = useRef<number | null>(null);
  const initialBoundsRef = useRef<any>(null);

  useEffect(() => {
    // Helpers to normalize incoming data shapes
    const parseJsonIfNeeded = (value: any) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try { return JSON.parse(trimmed); } catch { return value; }
        }
      }
      return value;
    };

    const normalizeGpsCoordinates = (value: any): Array<{ latitude: number; longitude: number; address?: string }> => {
      const parsed = parseJsonIfNeeded(value);
      const inputArray = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      const result: Array<{ latitude: number; longitude: number; address?: string }> = [];
      for (const item of inputArray) {
        if (!item) continue;
        // Support formats: {latitude, longitude}, {lat, lon}, "lat,lon" string
        if (typeof item === 'string') {
          const match = item.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
          if (match.length >= 2) {
            const lat = parseFloat(match[0]);
            const lng = parseFloat(match[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              result.push({ latitude: lat, longitude: lng });
            }
          }
        } else if (typeof item === 'object') {
          const lat = item.latitude ?? item.lat;
          const lng = item.longitude ?? item.lon ?? item.lng;
          const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
          const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
          if (
            typeof latNum === 'number' && typeof lngNum === 'number' &&
            !isNaN(latNum) && !isNaN(lngNum) &&
            latNum >= -90 && latNum <= 90 &&
            lngNum >= -180 && lngNum <= 180
          ) {
            result.push({ latitude: latNum, longitude: lngNum, address: item.address });
          }
        }
      }
      return result;
    };

    const normalizeNamedList = (value: any): Array<{ name: string }> => {
      const parsed = parseJsonIfNeeded(value);
      // Accept comma/semicolon/pipe separated strings
      if (typeof parsed === 'string') {
        const parts = parsed.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        return parts.map(name => ({ name }));
      }
      const arr = Array.isArray(parsed) ? parsed : [];
      return arr
        .map((it: any) => {
          if (!it) return null;
          if (typeof it === 'string') return { name: it };
          if (typeof it === 'object') {
            if (typeof it.name === 'string') return { name: it.name };
            // Sometimes objects might be single-key like { Spain: true }
            const firstKey = Object.keys(it)[0];
            if (firstKey) return { name: firstKey };
          }
          return null;
        })
        .filter(Boolean) as Array<{ name: string }>;
    };

    const normalizedGps = normalizeGpsCoordinates(gpsCoordinates);
    const normalizedCities = normalizeNamedList(cities);
    const normalizedCountries = normalizeNamedList(countries);

    // Dynamically import Leaflet to avoid SSR issues
    const initializeMap = async () => {
      const L = (await import('leaflet')).default;
      
      // Fix default markers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      if (!mapRef.current) return;

      // Clean up existing map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Initialize map (hide Leaflet footer/attribution)
      const mapa = L.map(mapRef.current, { attributionControl: false }).setView([40.4168, -3.7038], 6); // Default to Spain
      mapInstanceRef.current = mapa;

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapa);

      const bounds = L.latLngBounds([]);
      let hasValidCoordinates = false;
      let firstMarkerPlaced = false;
      let markerCount = 0;

      // Icons
      const redPinIcon = L.divIcon({
        html: `
          <svg width="30" height="40" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.35)"/>
              </filter>
            </defs>
            <g filter="url(#shadow)">
              <path d="M12 1C7.03 1 3 5.03 3 10c0 5.7 7.2 11.16 8.58 12.23.25.2.59.2.84 0C13.8 21.16 21 15.7 21 10 21 5.03 16.97 1 12 1z" fill="#ef4444"/>
              <circle cx="12" cy="10" r="3.2" fill="#111827"/>
            </g>
          </svg>
        `,
        className: '',
        iconSize: [30, 40],
        iconAnchor: [15, 32],
        popupAnchor: [0, -28]
      });

      const hqIcon = L.divIcon({
        html: `
          <svg width="44" height="44" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow2" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.25)"/>
              </filter>
            </defs>
            <g filter="url(#shadow2)">
              <circle cx="20" cy="20" r="19" fill="#2563eb"/>
              <circle cx="20" cy="20" r="15" fill="none" stroke="#ffffff" stroke-width="4"/>
              <circle cx="20" cy="20" r="12" fill="#2563eb"/>
              <!-- Building icon -->
              <rect x="13" y="13" width="14" height="14" rx="1.6" fill="#ffffff"/>
              <rect x="18" y="23" width="4" height="4" rx="0.6" fill="#2563eb"/>
              <g fill="#2563eb">
                <rect x="16" y="16" width="2" height="2" rx="0.3"/>
                <rect x="20" y="16" width="2" height="2" rx="0.3"/>
                <rect x="24" y="16" width="2" height="2" rx="0.3"/>
                <rect x="16" y="19" width="2" height="2" rx="0.3"/>
                <rect x="20" y="19" width="2" height="2" rx="0.3"/>
                <rect x="24" y="19" width="2" height="2" rx="0.3"/>
              </g>
            </g>
          </svg>
        `,
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 36],
        popupAnchor: [0, -32]
      });

      const buildPopupHtml = (
        name: string | undefined,
        city: string | undefined,
        country: string | undefined,
        isHqFlag: boolean,
        fallbackAddress?: string
      ) => {
        const lines: string[] = [];
        const company = name || 'Company';
        lines.push(`<strong>${company}</strong>`);
        const parts = [city, country].filter(Boolean).join(', ');
        if (parts) {
          lines.push(parts);
        } else if (fallbackAddress) {
          lines.push(fallbackAddress);
        }
        lines.push(isHqFlag ? 'Headquarters' : 'Office');
        return `<div>${lines.join('<br>')}</div>`;
      };

      // Add GPS coordinates markers (index-aware to map city/country)
      if (normalizedGps.length > 0) {
        for (let i = 0; i < normalizedGps.length; i++) {
          const coord = normalizedGps[i];
          const lat = coord.latitude;
          const lng = coord.longitude;
          const isHq = !firstMarkerPlaced;
          const marker = L.marker([lat, lng], { icon: isHq ? hqIcon : redPinIcon }).addTo(mapa);
          const cityName = normalizedCities[i]?.name;
          const countryName = normalizedCountries[i]?.name;
          marker.bindPopup(
            buildPopupHtml(companyName, cityName, countryName, isHq, coord.address)
          );
          bounds.extend([lat, lng]);
          hasValidCoordinates = true;
          firstMarkerPlaced = true;
          markerCount++;
        }
      }

      // Add city markers if no GPS coordinates
      if (!hasValidCoordinates && normalizedCities.length > 0) {
        const addedCities = new Set<string>();
        
        for (let i = 0; i < normalizedCities.length; i++) {
          const city = normalizedCities[i];
          if (city?.name && !addedCities.has(city.name)) {
            addedCities.add(city.name);
            
            try {
              // Use Nominatim to geocode city names
              const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city.name)}&limit=1`
              );
              const data = await response.json();
              
              if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                  const isHq = !firstMarkerPlaced;
                  const marker = L.marker([lat, lng], { icon: isHq ? hqIcon : redPinIcon }).addTo(mapa);
                  const countryName = normalizedCountries[i]?.name;
                  marker.bindPopup(
                    buildPopupHtml(companyName, city.name, countryName, isHq)
                  );
                  bounds.extend([lat, lng]);
                  hasValidCoordinates = true;
                  firstMarkerPlaced = true;
                  markerCount++;
                }
              }
            } catch (error) {
              
            }
          }
        }
      }

      // Add country markers if no other coordinates
      if (!hasValidCoordinates && normalizedCountries.length > 0) {
        const countryCoordinates: { [key: string]: [number, number] } = {
          'Spain': [40.4637, -3.7492],
          'France': [46.6034, 1.8883],
          'Germany': [51.1657, 10.4515],
          'Italy': [41.8719, 12.5674],
          'United Kingdom': [55.3781, -3.4360],
          'Portugal': [39.3999, -8.2245],
          'Netherlands': [52.1326, 5.2913],
          'Belgium': [50.5039, 4.4699],
          'Switzerland': [46.8182, 8.2275],
          'Austria': [47.5162, 14.5501],
          'Poland': [51.9194, 19.1451],
          'Czech Republic': [49.8175, 15.4730],
          'Hungary': [47.1625, 19.5033],
          'Slovakia': [48.6690, 19.6990],
          'Slovenia': [46.1512, 14.9955],
          'Croatia': [45.1000, 15.2000],
          'Romania': [45.9432, 24.9668],
          'Bulgaria': [42.7339, 25.4858],
          'Greece': [39.0742, 21.8243],
          'Turkey': [38.9637, 35.2433],
          'United States': [37.0902, -95.7129],
          'Canada': [56.1304, -106.3468],
          'Mexico': [23.6345, -102.5528],
          'Brazil': [-14.2350, -51.9253],
          'Argentina': [-38.4161, -63.6167],
          'Chile': [-35.6751, -71.5430],
          'Colombia': [4.5709, -74.2973],
          'Peru': [-9.1900, -75.0152],
          'Venezuela': [6.4238, -66.5897],
          'Ecuador': [-1.8312, -78.1834],
          'Uruguay': [-32.5228, -55.7658],
          'Paraguay': [-23.4425, -58.4438],
          'Bolivia': [-16.2902, -63.5887],
          'Japan': [36.2048, 138.2529],
          'China': [35.8617, 104.1954],
          'India': [20.5937, 78.9629],
          'South Korea': [35.9078, 127.7669],
          'Thailand': [15.8700, 100.9925],
          'Vietnam': [14.0583, 108.2772],
          'Indonesia': [-0.7893, 113.9213],
          'Malaysia': [4.2105, 101.9758],
          'Singapore': [1.3521, 103.8198],
          'Philippines': [12.8797, 121.7740],
          'Australia': [-25.2744, 133.7751],
          'New Zealand': [-40.9006, 174.8860],
          'South Africa': [-30.5595, 22.9375],
          'Egypt': [26.8206, 30.8025],
          'Morocco': [31.7917, -7.0926],
          'Nigeria': [9.0820, 8.6753],
          'Kenya': [-0.0236, 37.9062],
          'Russia': [61.5240, 105.3188],
          'Ukraine': [48.3794, 31.1656],
          'Norway': [60.4720, 8.4689],
          'Sweden': [60.1282, 18.6435],
          'Denmark': [56.2639, 9.5018],
          'Finland': [61.9241, 25.7482],
          'Iceland': [64.9631, -19.0208],
          'Ireland': [53.1424, -7.6921],
        };

        for (let i = 0; i < normalizedCountries.length; i++) {
          const country = normalizedCountries[i];
          if (country?.name && countryCoordinates[country.name]) {
            const [lat, lng] = countryCoordinates[country.name];
            const isHq = !firstMarkerPlaced;
            const marker = L.marker([lat, lng], { icon: isHq ? hqIcon : redPinIcon }).addTo(mapa);
            marker.bindPopup(
              buildPopupHtml(companyName, undefined, country.name, isHq)
            );
            bounds.extend([lat, lng]);
            hasValidCoordinates = true;
            firstMarkerPlaced = true;
            markerCount++;
          }
        }
      }

      // Set map view based on markers
      if (hasValidCoordinates && bounds.isValid()) {
        if (markerCount === 1) {
          // For a single location, zoom out to show a wider context
          mapa.setView(bounds.getCenter(), 3);
          // Do not store initial bounds so restore uses center+zoom
          initialBoundsRef.current = null;
        } else {
          // If markers are very close to each other, avoid an overly tight zoom
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const clusterDistanceMeters = L.latLng(sw).distanceTo(L.latLng(ne));
          if (clusterDistanceMeters < 150000) { // ~150 km
            mapa.setView(bounds.getCenter(), 3);
            initialBoundsRef.current = null;
          } else {
            mapa.fitBounds(bounds, { 
              padding: [20, 20],
              maxZoom: 15 
            });
            // Preserve initial bounds used for the first fit
            initialBoundsRef.current = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
          }
        }
      } else {
        // No markers -> clear initial bounds
        initialBoundsRef.current = null;
      }

      // Store initial view (after adjustment) for restore
      originalCenterRef.current = mapa.getCenter();
      originalZoomRef.current = mapa.getZoom();

      // Add a top-right control to restore view
      const RestoreControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
          const container = L.DomUtil.create('div');
          const button = L.DomUtil.create('button', '', container);
          button.title = 'Restore view';
          button.innerHTML = '↺';
          button.style.background = '#ffffff';
          button.style.border = '1px solid #e5e7eb';
          button.style.borderRadius = '8px';
          button.style.width = '32px';
          button.style.height = '32px';
          button.style.cursor = 'pointer';
          button.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
          button.style.display = 'flex';
          button.style.alignItems = 'center';
          button.style.justifyContent = 'center';
          button.style.fontSize = '16px';
          button.style.color = '#111827';
          
          L.DomEvent.disableClickPropagation(button);
          L.DomEvent.on(button, 'click', (e: any) => {
            e.preventDefault();
            // Prefer restoring the original bounds to ensure all markers are visible
            if (initialBoundsRef.current) {
              mapa.fitBounds(initialBoundsRef.current, { padding: [20, 20], maxZoom: 15 });
              return;
            }
            if (originalCenterRef.current && originalZoomRef.current !== null) {
              mapa.setView(originalCenterRef.current, originalZoomRef.current);
            }
          });
          
          return container;
        }
      });

      new RestoreControl().addTo(mapa);
    };

    initializeMap();

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [gpsCoordinates, cities, countries, companyName]);

  return (
    <div className={`w-full ${heightClass} rounded-lg overflow-hidden shadow-lg border border-gray-200`}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default SupplierMap;