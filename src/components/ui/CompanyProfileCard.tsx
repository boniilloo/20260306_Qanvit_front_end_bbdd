import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, MapPin, Building, Users, Award, ExternalLink } from 'lucide-react';
import EnhancedCard from './EnhancedCard';
import SaveToListModal from '../SaveToListModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AdditionalInfo {
  description?: string;
  specifications?: string[];
  questions?: string[];
}

interface CompanyProfileCardProps {
  company: {
    id?: string;
    nombre_empresa?: string;
    description?: string;
    website?: string;
    countries?: any;
    main_activities?: string;
    sectors?: string;
    logo?: string;
    strengths?: string;
    revenues?: any;
    certifications?: any;
    products_services_json?: any;
  };
  additionalInfo?: AdditionalInfo;
}

const CompanyProfileCard = ({ company, additionalInfo }: CompanyProfileCardProps) => {
  const { user } = useAuth();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (company.logo) {
      setLogoUrl(company.logo);
    }
  }, [company.logo]);

  useEffect(() => {
    const checkSavedStatus = async () => {
      if (!user || !company.id) return;
      
      const { data } = await supabase
        .from('saved_companies')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_id', company.id)
        .single();
      
      setIsSaved(!!data);
    };

    checkSavedStatus();
  }, [user, company.id]);

  const handleViewDetails = () => {
    if (company.website) {
      window.open(company.website, '_blank');
    }
  };

  const handleSaveCompany = () => {
    if (user && company.nombre_empresa) {
      setShowSaveModal(true);
    }
  };

  const handleSaveSuccess = () => {
    setShowSaveModal(false);
    setIsSaved(true);
  };

  const countries = Array.isArray(company.countries) ? company.countries : 
                   typeof company.countries === 'string' ? [company.countries] : [];

  const sectors = company.sectors ? company.sectors.split(',').map(s => s.trim()) : [];
  const activities = company.main_activities ? company.main_activities.split(',').map(a => a.trim()) : [];
  
  const revenues = company.revenues && typeof company.revenues === 'object' ? company.revenues : null;
  const certifications = Array.isArray(company.certifications) ? company.certifications : [];

  return (
    <>
      <EnhancedCard className="w-full min-h-[700px] p-8 overflow-y-auto">
        <div className="space-y-6">
          {/* Header Section with Background Image */}
          <div className="relative mb-8">
            {/* Background gradient using FQ palette */}
            <div className="absolute inset-0 bg-gradient-to-r from-sky-light/20 to-sky-light/30 rounded-lg opacity-50"></div>
            
            <div className="relative flex items-start gap-6 p-6">
              <div className="flex-shrink-0">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={`${company.nombre_empresa} logo`}
                    className="w-24 h-24 object-contain rounded-lg border border-gray-200 bg-white p-2 shadow-md"
                    onError={() => setLogoUrl(null)}
                  />
                ) : (
                  <div className="w-24 h-24 bg-gradient-to-br from-sky-light/30 to-sky/40 rounded-lg flex items-center justify-center border border-gray-200 shadow-md">
                    <Building className="w-10 h-10 text-navy" />
                  </div>
                )}
              </div>
            
              <div className="flex-1">
                <h2 className="text-4xl font-bold text-gray-900 mb-3">
                  {company.nombre_empresa || 'Company Profile'}
                </h2>
                
                {countries.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-5 h-5 text-gray-500" />
                    <span className="text-lg text-gray-600">
                      {countries.join(', ')}
                    </span>
                  </div>
                )}

                {company.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-gray-500" />
                    <a 
                      href={company.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-lg text-primary hover:text-primary-dark hover:underline"
                    >
                      {company.website}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Agent Analysis Description */}
          {additionalInfo?.description && (
            <div className="bg-gradient-to-r from-sky-light/10 to-mint/10 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🤖 Agent Analysis
              </h3>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {additionalInfo.description}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {company.description && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Company Overview</h3>
              <p className="text-gray-700 leading-relaxed">
                {company.description}
              </p>
            </div>
          )}

          {/* Main Activities with Visual Enhancement */}
          {activities.length > 0 && (
            <div className="bg-gradient-to-r from-sky-light/15 to-primary/10 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Main Activities
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {activities.slice(0, 12).map((activity, index) => (
                  <Badge key={index} variant="secondary" className="bg-white text-primary border-primary/30 p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                    {activity}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Sectors with Enhanced Visual Design */}
          {sectors.length > 0 && (
            <div className="bg-gradient-to-r from-mint/15 to-mint/25 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-mint-dark" />
                Industry Sectors
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sectors.slice(0, 9).map((sector, index) => (
                  <Badge key={index} variant="outline" className="border-mint text-mint-dark bg-white p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                    {sector}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Strengths */}
          {company.strengths && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Strengths</h3>
              <p className="text-gray-700 leading-relaxed">
                {company.strengths}
              </p>
            </div>
          )}

          {/* Revenue Information */}
          {revenues && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Financial Information
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                {revenues.revenue_range && (
                  <p className="text-gray-700">
                    <span className="font-medium">Revenue Range:</span> {revenues.revenue_range}
                  </p>
                )}
                {revenues.employee_count && (
                  <p className="text-gray-700">
                    <span className="font-medium">Employees:</span> {revenues.employee_count}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4" />
                Certifications
              </h3>
              <div className="flex flex-wrap gap-2">
                 {certifications.slice(0, 5).map((cert, index) => (
                   <Badge key={index} variant="outline" className="border-navy/30 text-navy">
                     {cert}
                   </Badge>
                 ))}
              </div>
            </div>
          )}

          {/* Key Specifications */}
          {additionalInfo?.specifications && additionalInfo.specifications.length > 0 && (
            <div className="bg-gradient-to-r from-primary/10 to-sky-light/15 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                🔍 Key Specifications
              </h3>
              <ul className="space-y-2">
                {additionalInfo.specifications.map((spec, index) => (
                  <li key={index} className="text-primary leading-relaxed">• {spec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions to Consider */}
          {additionalInfo?.questions && additionalInfo.questions.length > 0 && (
            <div className="bg-gradient-to-r from-mint/10 to-sky-light/15 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                ❓ Questions to Consider
              </h3>
              <ul className="space-y-2">
                {additionalInfo.questions.map((question, index) => (
                  <li key={index} className="text-navy leading-relaxed">• {question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
          <Button
            onClick={handleViewDetails}
            className="flex-1 bg-primary hover:bg-primary-dark text-white"
            disabled={!company.website}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Details
          </Button>
          
          <Button
            onClick={handleSaveCompany}
            variant={isSaved ? "default" : "outline"}
            className={`flex-1 ${isSaved 
              ? 'bg-mint hover:bg-mint-dark text-navy' 
              : 'border-primary/30 text-primary hover:bg-primary/10'
            }`}
            disabled={!user || !company.nombre_empresa || isSaved}
          >
            {isSaved ? 'Saved' : 'Save Supplier'}
          </Button>
        </div>
      </EnhancedCard>

      {showSaveModal && (
        <SaveToListModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          companyId={company.id || ''}
          companyName={company.nombre_empresa || ''}
          userId=""
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </>
  );
};

export default CompanyProfileCard;