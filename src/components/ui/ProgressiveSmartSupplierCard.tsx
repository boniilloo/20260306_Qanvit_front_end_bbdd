import React from 'react';
import { MapPin } from 'lucide-react';
import ProgressiveSmartLogo from './ProgressiveSmartLogo';

// Helper function to get first city and first country
const getFirstLocation = (cities: any, countries: any): string => {
  try {
    // Handle cities - can be string, array of strings, or array of objects
    let firstCity = '';
    if (cities) {
      if (typeof cities === 'string') {
        // If it's a JSON string, try to parse it
        if (cities.startsWith('[')) {
          const parsed = JSON.parse(cities);
          firstCity = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : '';
        } else {
          firstCity = cities;
        }
      } else if (Array.isArray(cities) && cities.length > 0) {
        // Handle array format - could be objects with nested structure or simple strings
        const city = cities[0];
        firstCity = city.city?.name || city.name || city;
      }
    }

    // Handle countries - can be string, array of strings, or array of objects
    let firstCountry = '';
    if (countries) {
      if (typeof countries === 'string') {
        // If it's a JSON string, try to parse it
        if (countries.startsWith('[')) {
          const parsed = JSON.parse(countries);
          firstCountry = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : '';
        } else {
          firstCountry = countries;
        }
      } else if (Array.isArray(countries) && countries.length > 0) {
        // Handle array format - could be objects with nested structure or simple strings
        const country = countries[0];
        firstCountry = country.country?.name || country.name || country;
      }
    }

    // Return formatted location
    if (firstCity && firstCountry) {
      return `${firstCity}, ${firstCountry}`;
    } else if (firstCity) {
      return firstCity;
    } else if (firstCountry) {
      return firstCountry;
    }
    
    return '';
  } catch (error) {
    return '';
  }
};

// Helper function to truncate text
const truncateText = (text: string, maxLength: number = 120): string => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  // Find the last space before maxLength to avoid cutting words
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) { // If we found a space in the last 20% of the text
    return text.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
};

interface ProgressiveSmartSupplierCardProps {
  supplier: {
    id: string;
    slug: string | null;
    nombre_empresa: string;
    description: string | null;
    countries: any;
    cities: any;
    sectors: string | null;
    website: string | null;
    main_activities: string | null;
    strengths: string | null;
    logo: string | null;
  };
  onView: () => void;
  onOpenInNewTab?: () => void;
  isSuspicious?: boolean;
  deobfuscateText?: (text: string) => string;
}

/**
 * Progressive Smart supplier card that shows content immediately
 * and loads images progressively with shimmer placeholders
 */
export const ProgressiveSmartSupplierCard: React.FC<ProgressiveSmartSupplierCardProps> = ({
  supplier,
  onView,
  onOpenInNewTab,
  isSuspicious = false,
  deobfuscateText
}) => {
  const handleAuxClick = (e: React.MouseEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (e.button === 1 && onOpenInNewTab) {
      e.preventDefault();
      e.stopPropagation();
      onOpenInNewTab();
    }
  };
  
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        border: '1px solid #e5e5e5',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.2s',
        height: 'fit-content',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '24px',
        breakInside: 'avoid',
        width: '100%'
      }}
      onClick={onView}
      onAuxClick={handleAuxClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px'}}>
        {/* Progressive Smart Logo Container */}
        <ProgressiveSmartLogo
          logoUrl={supplier.logo}
          websiteUrl={supplier.website}
          companyName={supplier.nombre_empresa}
          size="md"
          className="rounded-lg"
          showDebugInfo={false}
          isSupplierRoute={true}
        />
        
        <div style={{flex: 1}}>
          <h3 style={{fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '4px'}}>
            {isSuspicious && deobfuscateText ? deobfuscateText(supplier.nombre_empresa) : supplier.nombre_empresa}
          </h3>
          {supplier.website && (
            <a
              href={supplier.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{fontSize: '12px', color: '#007bff', textDecoration: 'none'}}
              onClick={(e) => e.stopPropagation()}
            >
              Visit Website
            </a>
          )}
        </div>
      </div>

      <p style={{color: '#666', fontSize: '14px', marginBottom: '12px', lineHeight: '1.4', flexGrow: 1}}>
        {(() => {
          const activitiesText = isSuspicious && deobfuscateText 
            ? deobfuscateText(supplier.main_activities || 'No main activities available') 
            : (supplier.main_activities || 'No main activities available');
          return truncateText(activitiesText, 120);
        })()}
      </p>

      <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', fontSize: '14px', color: '#666'}}>
        <MapPin style={{width: '16px', height: '16px'}} />
        <span>
          {getFirstLocation(supplier.cities, supplier.countries)}
        </span>
      </div>

      <button
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          marginTop: 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
        onAuxClick={handleAuxClick}
      >
        View Profile
      </button>
    </div>
  );
};

export default ProgressiveSmartSupplierCard;
