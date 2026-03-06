import React from 'react';
import { MapPin } from 'lucide-react';
import SmartLogo from './SmartLogo';

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


interface SmartSupplierCardProps {
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
  isSuspicious?: boolean;
  deobfuscateText?: (text: string) => string;
}

/**
 * Smart supplier card that automatically detects if logos need dark background
 * using computer vision analysis
 */
export const SmartSupplierCard: React.FC<SmartSupplierCardProps> = ({
  supplier,
  onView,
  isSuspicious = false,
  deobfuscateText
}) => {
  
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
        {/* Smart Logo Container */}
        <SmartLogo
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
        {isSuspicious && deobfuscateText 
          ? deobfuscateText(supplier.main_activities || 'No main activities available') 
          : (supplier.main_activities || 'No main activities available')}
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
        onClick={onView}
      >
        View Profile
      </button>

    </div>
  );
};
