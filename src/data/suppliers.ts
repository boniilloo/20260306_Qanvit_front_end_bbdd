
export interface Supplier {
  id: number;
  name: string;
  slug: string;
  location: string;
  flag: string;
  capability: string;
  score: number;
  certifications: string[];
  tagline: string;
  markets: string[];
  address: string;
  founded: string;
  ownership: string;
  employees: string;
  revenue: string;
  technicalChips: string[];
  financials: {
    year2022: string;
    year2023: string;
    year2024: string;
    cagr: string;
    ebitda: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
  };
}

export const suppliers: Supplier[] = [
  {
    id: 1,
    name: 'ISRA VISION',
    slug: 'isra-vision',
    location: 'Germany',
    flag: '🇩🇪',
    capability: 'Global leader in surface-inspection for auto & glass.',
    score: 96,
    certifications: ['ISO 9001', 'ISO 14001'],
    tagline: 'Empowering Vision Excellence for glass, metal & battery lines.',
    markets: ['Automotive glass', 'flat-rolled metals', 'pouch-cell batteries'],
    address: 'Frankfurter Straße 112, 64293 Darmstadt, Germany',
    founded: '1985',
    ownership: 'Public (Atlas Copco Group)',
    employees: '≈ 1,000 (FTE)',
    revenue: 'US $ 750 M',
    technicalChips: ['SmartSurface4', 'PowerPlate 3D', 'Cloud Xperience', 'inline crack-&-scratch AI', 'Industry 4.0 OPC UA gateway'],
    financials: {
      year2022: '€670 M',
      year2023: '€710 M',
      year2024: '€750 M',
      cagr: '5%',
      ebitda: '18% est.',
    },
    contact: {
      phone: '+49 6151 948 0',
      email: 'info@isravision.com',
      website: 'www.isravision.com',
    }
  },
  {
    id: 2,
    name: 'Dr. Schenk GmbH',
    slug: 'dr-schenk-gmbh',
    location: 'Germany',
    flag: '🇩🇪',
    capability: '40+ yrs high-speed web & metal defect detection expertise.',
    score: 94,
    certifications: ['ISO 9001', 'CE', 'UL'],
    tagline: 'Precision in focus – surface inspection & measurement since 1985.',
    markets: ['Display glass', 'polymer film', 'non-wovens', 'battery foils'],
    address: 'Bussardstr. 2, 82166 Gräfelfing/Martinsried, Germany',
    founded: '1985',
    ownership: 'Private',
    employees: '≈ 320',
    revenue: '€ 85 M est.',
    technicalChips: ['MIDA multi-illumination', 'Sirius Light Tech', 'modular Scan-Master web scanners'],
    financials: {
      year2022: '€75 M est.',
      year2023: '€80 M est.',
      year2024: '€85 M est.',
      cagr: '6% est.',
      ebitda: '15% est.',
    },
    contact: {
      phone: '+49 89 85695 0',
      email: 'info@drschenk.com',
      website: 'www.drschenk.com',
    }
  },
  {
    id: 3,
    name: 'AMETEK Surface Vision',
    slug: 'ametek-surface-vision',
    location: 'USA',
    flag: '🇺🇸',
    capability: 'World leader in online surface inspection & process monitoring',
    score: 93,
    certifications: ['ISO 9001', 'ISO 14001', 'UL 508A'],
    tagline: 'SmartView® & SmartAdvisor® – world leaders in online web inspection.',
    markets: ['Flat-rolled metals', 'pulp & paper', 'lithium-battery foil', 'plastics'],
    address: '1288 San Luis Obispo Ave, Hayward, CA 94544, USA',
    founded: '1993',
    ownership: 'AMETEK Inc.',
    employees: '≈ 150 (LinkedIn range 51-200)',
    revenue: 'US $ 150 M est., parent AMETEK Inc. US $ 7.0 B',
    technicalChips: ['SmartView® 4K camera bars', 'SmartAdvisor® AI defect classifier', 'edge-cloud analytics'],
    financials: {
      year2022: '$130 M est.',
      year2023: '$140 M est.',
      year2024: '$150 M est.',
      cagr: '7% est.',
      ebitda: '20% est.',
    },
    contact: {
      phone: '+1 510 431 6767',
      email: 'surfacevision.info@ametek.com',
      website: 'www.ameteksurfacevision.com',
    }
  },
  {
    id: 4,
    name: 'EINES Vision Systems',
    slug: 'eines-vision-systems',
    location: 'Spain',
    flag: '🇪🇸',
    capability: '30 yrs inline QC for automotive paint & metrology lines.',
    score: 91,
    certifications: ['IATF 16949', 'ISO 9001', 'CE'],
    tagline: '30+ years of turnkey vision QC for global automotive OEMs.',
    markets: ['Press-shop to final assembly', 'EV battery', 'paint shop'],
    address: 'Carcaixent, Valencia, Spain (regional HQ Barcelona)',
    founded: '1992',
    ownership: 'Private',
    employees: '≈ 250 est.',
    revenue: '€ 60 M est.',
    technicalChips: ['Metrology Tunnel', 'Paint Defect Inspector', 'Deep-Learning gap-&-flush AI', 'robot guidance modules'],
    financials: {
      year2022: '€50 M est.',
      year2023: '€55 M est.',
      year2024: '€60 M est.',
      cagr: '9% est.',
      ebitda: '14% est.',
    },
    contact: {
      phone: '+34 934 67 53 27',
      email: 'contact@eines.com',
      website: 'www.eines.com',
    }
  },
  {
    id: 5,
    name: 'ISR Specular Vision',
    slug: 'isr-specular-vision',
    location: 'Spain',
    flag: '🇪🇸',
    capability: 'AI inspection of reflective & transparent specular surfaces.',
    score: 89,
    certifications: ['ISO 9001', 'EU Eco-design', 'R&D Horizon-EU grant'],
    tagline: 'Specular surface quality inspection for high-gloss parts.',
    markets: ['Lighting reflectors', 'stainless décor panels', 'glass cook-tops', 'cosmetic caps'],
    address: 'C/ Mercedes Lamarque 1, 23009 Jaén, Spain',
    founded: '2012 est.',
    ownership: 'Private',
    employees: '≈ 120 est.',
    revenue: '€ 25 M est.',
    technicalChips: ['Optical Inspection Technology (OIT®) lighting', 'Specular Zero analytics', 'edge-AI scratch & dent detection'],
    financials: {
      year2022: '€18 M est.',
      year2023: '€22 M est.',
      year2024: '€25 M est.',
      cagr: '18% est.',
      ebitda: '12% est.',
    },
    contact: {
      phone: '+34 953 22 14 80',
      email: 'info@isr-vision.com',
      website: 'www.isr-vision.com',
    }
  }
];

// Helper function to find supplier by slug
export const findSupplierBySlug = (slug: string): Supplier | undefined => {
  return suppliers.find(supplier => supplier.slug === slug);
};
