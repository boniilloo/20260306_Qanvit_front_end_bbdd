import React, { useEffect, useState } from 'react';
import { ExternalLink, Eye } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ProductData {
  id?: string;
  product_id?: string;
  product_name: string;
  main_category?: string;
  use_cases?: string | string[];
  target_industries?: string | string[];
  source?: string;
}

interface ProductInfoCardProps {
  product: ProductData;
}

const ProductInfoCard = ({ product }: ProductInfoCardProps) => {
  const [companySlug, setCompanySlug] = useState<string | null>(null);

  // Helper function to parse use cases and target industries
  const parseArrayField = (field: string | string[] | undefined): string[] => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    
    // Try to parse JSON
    if (typeof field === 'string') {
      if (field.startsWith('[')) {
        try {
          return JSON.parse(field);
        } catch (e) {
          // If JSON parse fails, fall through to comma split
        }
      }
      // Split by comma followed by uppercase letter (e.g., "item1,Item2,Item3")
      // Using regex to split on comma followed by capital letter
      const items = field.split(/,(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 0);
      
      // If no items found with the uppercase pattern, try regular comma split
      if (items.length === 0 || (items.length === 1 && field.includes(','))) {
        return field.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
      
      return items;
    }
    
    return [];
  };

  // Obtener el slug de la empresa desde el product_id
  useEffect(() => {
    const fetchCompanySlug = async () => {
      if (product.product_id) {
        try {
          const { data: productData, error: productError } = await supabase
            .from('product')
            .select('company_id')
            .eq('id', product.product_id)
            .single();

          if (productError || !productData) return;

          const { data: companyData, error: companyError } = await supabase
            .from('company_revision')
            .select('slug')
            .eq('company_id', productData.company_id)
            .eq('is_active', true)
            .single();

          if (companyError || !companyData) return;

          setCompanySlug(companyData.slug);
        } catch (error) {
          // Error handling
        }
      }
    };

    fetchCompanySlug();
  }, [product.product_id]);

  const handleViewMore = async () => {
    if (!product.product_id) return;

    try {
      // Same logic as PropuestaCard - get company slug if we don't have it
      let slugToUse = companySlug;
      
      if (!slugToUse) {
        const { data: productData, error: productError } = await supabase
          .from('product')
          .select('company_id')
          .eq('id', product.product_id)
          .single();

        if (productError || !productData) {
          toast({
            title: "Error",
            description: "Could not load product details",
            variant: "destructive",
          });
          return;
        }

        const { data: companyData, error: companyError } = await supabase
          .from('company_revision')
          .select('slug')
          .eq('company_id', productData.company_id)
          .eq('is_active', true)
          .single();

        if (companyError || !companyData?.slug) {
          toast({
            title: "Error",
            description: "Could not load company details",
            variant: "destructive",
          });
          return;
        }

        slugToUse = companyData.slug;
      }

      // Navigate to product view within supplier
      window.open(`/suppliers/${slugToUse}/product/${encodeURIComponent(product.product_name)}`, '_blank');
    } catch (err) {
      console.error('Error navigating:', err);
      toast({
        title: "Error",
        description: "Could not navigate to product details",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-white w-[260px] md:w-[300px] xl:w-[320px] flex flex-col justify-between rounded-3xl border border-sky/20 overflow-hidden hover:shadow-md transition mx-3 md:mx-0 h-full">
      <div className="flex flex-col h-full pt-5 pb-6 px-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h4 className="font-semibold text-[16px] text-navy leading-tight flex-1">{product.product_name}</h4>
        </div>

        {/* Content sections */}
        <div className="space-y-3 flex-1">
          {product.main_category && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Category:</span>
              <p className="text-[12px] text-charcoal leading-relaxed mt-1 line-clamp-3">{product.main_category}</p>
            </div>
          )}
          
          {product.use_cases && parseArrayField(product.use_cases).length > 0 && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Use Cases:</span>
              <ul className="text-[12px] text-charcoal leading-relaxed mt-1 space-y-1">
                {parseArrayField(product.use_cases).slice(0, 3).map((useCase, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-navy mt-0.5">•</span>
                    <span className="line-clamp-2">{useCase}</span>
                  </li>
                ))}
                {parseArrayField(product.use_cases).length > 3 && (
                  <li className="text-navy/60 italic">+{parseArrayField(product.use_cases).length - 3} more...</li>
                )}
              </ul>
            </div>
          )}
          
          {product.target_industries && parseArrayField(product.target_industries).length > 0 && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Target Industries:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {parseArrayField(product.target_industries).slice(0, 4).map((industry, index) => (
                  <span key={index} className="text-[11px] bg-navy/10 text-navy px-2 py-0.5 rounded">
                    {industry}
                  </span>
                ))}
                {parseArrayField(product.target_industries).length > 4 && (
                  <span className="text-[11px] text-navy/60 italic px-2">+{parseArrayField(product.target_industries).length - 4}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer button */}
      <button
        onClick={handleViewMore}
        className="h-12 w-full bg-mint hover:bg-mint/90 text-navy flex items-center justify-center gap-2 rounded-b-3xl transition-colors"
      >
        <Eye size={18} />
        <span className="text-[17px] font-semibold">View More</span>
      </button>
    </div>
  );
};

export default ProductInfoCard;