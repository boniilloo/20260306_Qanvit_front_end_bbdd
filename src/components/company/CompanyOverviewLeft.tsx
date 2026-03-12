import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Building2, Info } from 'lucide-react';
import SupplierMap from '@/components/SupplierMap';
import RevenueChart from '@/components/ui/RevenueChart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface CompanyOverviewData {
  nombre_empresa?: string;
  description?: string;
  main_activities?: string;
  strengths?: string;
  sectors?: string;
  certifications?: any;
  main_customers?: any;
  cities?: any;
  countries?: any;
  gps_coordinates?: any;
  revenues?: any;
}

interface CompanyOverviewLeftProps {
  data: CompanyOverviewData;
}

const CompanyOverviewLeft: React.FC<CompanyOverviewLeftProps> = ({ data }) => {
  return (
    <div className="lg:col-span-3 space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-navy mb-2">Company Overview</h3>
        <p className="text-charcoal leading-relaxed">
          {data.description || "Professional supplier providing quality solutions to businesses worldwide."}
        </p>
        {data.main_activities && (
          <div className="mt-6">
            <h3 className="text-xl font-semibold text-navy mb-2">Core Activities</h3>
            <p className="text-charcoal leading-relaxed">
              {data.main_activities}
            </p>
          </div>
        )}

        {data.strengths && (
          <div className="mt-6">
            <h3 className="text-xl font-semibold text-navy mb-2">Strengths</h3>
            <p className="text-charcoal leading-relaxed">
              {data.strengths}
            </p>
          </div>
        )}
      </div>

      {data.sectors && (
        <div>
          <h3 className="text-xl font-semibold text-navy mb-2">Industries</h3>
          <p className="text-charcoal leading-relaxed">
            {data.sectors}
          </p>
        </div>
      )}

      {/* Certifications */}
      {(() => {
        try {
          let certificationsList: any = data.certifications;
          if (typeof certificationsList === 'string') {
            certificationsList = certificationsList.startsWith('[')
              ? JSON.parse(certificationsList)
              : [certificationsList];
          }
          if (Array.isArray(certificationsList) && certificationsList.length > 0) {
            return (
              <div>
                <h3 className="text-xl font-semibold text-navy mb-2">Certifications</h3>
                <div className="flex flex-wrap gap-2">
                  {certificationsList.map((cert: any, index: number) => (
                    <Badge key={index} variant="secondary" className="bg-amber-50 text-amber-800 border-amber-200">
                      {typeof cert === 'object' ? (cert.name || cert.label || JSON.stringify(cert)) : cert}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          }
        } catch (error) {
          console.error('Error parsing certifications:', error);
        }
        return null;
      })()}

      {/* Main Customers */}
      {(() => {
        try {
          let customersList: any = data.main_customers;
          if (typeof customersList === 'string') {
            customersList = customersList.startsWith('[') ? JSON.parse(customersList) : [customersList];
          }
          if (Array.isArray(customersList) && customersList.length > 0) {
            return (
              <div>
                <h3 className="text-xl font-semibold text-navy mb-2">Main Customers</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customersList.map((customer: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-navy font-medium text-sm truncate">
                          {typeof customer === 'object' ? (customer.name || customer.company || JSON.stringify(customer)) : customer}
                        </p>
                        {typeof customer === 'object' && customer.industry && (
                          <p className="text-blue-600 text-xs">
                            {customer.industry}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
        } catch (error) {
          console.error('Error parsing main customers:', error);
        }
        return null;
      })()}

      {/* Locations and Revenue Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Locations - Left */}
        {(data.cities || data.countries || data.gps_coordinates) && (
          <div>
            <h3 className="text-xl font-semibold text-navy mb-2">Locations</h3>
            <div className="mt-6">
              <SupplierMap heightClass="h-96" gpsCoordinates={data.gps_coordinates} cities={data.cities} countries={data.countries} companyName={data.nombre_empresa || 'Company'} />
            </div>
          </div>
        )}

        {/* Revenue Information - Right */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-semibold text-navy">Revenue Information</h3>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center w-4 h-4 text-slate-500 cursor-help">
                    <Info className="w-4 h-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Economic data has not yet been verified by Qanvit. This feature is under development.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {data.revenues ? (
            <RevenueChart revenues={data.revenues} companyName={data.nombre_empresa || 'Company'} />
          ) : (
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
              No company financial data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanyOverviewLeft;


