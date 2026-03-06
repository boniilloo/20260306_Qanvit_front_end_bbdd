
import React from 'react';
import { Save, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';

interface Supplier {
  name: string;
  location: string;
  flag?: string;
  certifications?: string[];
  capability: string;
  score: number;
  slug?: string;
  id?: string;
}

interface SupplierCardProps {
  supplier: Supplier;
}

const SupplierCard = ({ supplier }: SupplierCardProps) => {
  // Use slug if available, otherwise fallback to id or generated slug
  const slug = supplier.slug || supplier.id || supplier.name.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <div className="w-[320px] h-[400px] bg-white rounded-fq border border-sky/20 shadow-fq hover:shadow-fq-hover hover:translate-y-[-2px] transition-all duration-200 flex flex-col">
      <div className="p-6 flex-1">
        {/* Company Logo/Avatar */}
        <div className="w-16 h-16 bg-sky/20 rounded-fq mb-4 flex items-center justify-center">
          <span className="text-xl font-bold text-navy font-intro">
            {supplier.name.charAt(0)}
          </span>
        </div>
        
        {/* Company Name and Location */}
        <div className="mb-4">
          <h3 className="font-bold text-lg text-navy font-intro mb-1">
            {supplier.name} {supplier.flag && <span>{supplier.flag}</span>}
          </h3>
          <p className="text-sm text-charcoal/70 font-inter">{supplier.location}</p>
        </div>
        
        {/* Short Pitch */}
        <p className="text-sm text-charcoal font-inter mb-6 line-clamp-4 leading-relaxed">
          {supplier.capability}
        </p>
        
        {/* Supplier Score */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-charcoal/70 font-inter">Supplier Score</span>
            <span className="text-lg font-bold text-navy font-intro">{supplier.score}%</span>
          </div>
          <Progress 
            value={supplier.score} 
            className="h-2 bg-sky/20"
          />
        </div>
        
        {/* View Supplier Link */}
        <Link 
          to={`/suppliers/${slug}`} 
          className="text-sky text-sm hover:underline flex items-center font-inter" 
        >
          View supplier <ExternalLink size={14} className="ml-1" />
        </Link>
      </div>
      
      {/* Save Button */}
      <button className="w-full bg-mint text-navy py-4 px-6 rounded-b-fq hover:bg-mint/90 transition-colors flex items-center justify-center gap-2 font-semibold font-inter">
        <Save size={18} />
        <span>Save supplier</span>
      </button>
    </div>
  );
};

export default SupplierCard;
