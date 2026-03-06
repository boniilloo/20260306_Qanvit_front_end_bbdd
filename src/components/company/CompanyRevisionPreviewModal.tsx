import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CompanyOverviewLeft from '@/components/company/CompanyOverviewLeft';
import CompanyOverviewRightContact from '@/components/company/CompanyOverviewRightContact';
import { supabase } from '@/integrations/supabase/client';
import { CompanyDocumentViewCard } from '@/components/company/CompanyDocumentViewCard';

interface CompanyRevision {
  id: string;
  company_id?: string;
  nombre_empresa?: string;
  description?: string;
  main_activities?: string;
  sectors?: string;
  strengths?: string;
  website?: string;
  cities?: any;
  countries?: any;
  certifications?: any;
  revenues?: any;
  main_customers?: any;
  contact_emails?: any;
  contact_phones?: any;
  logo?: string;
  gps_coordinates?: any;
  created_at: string;
  is_active: boolean;
  source: string;
  comment?: string;
  created_by?: string;
  creator_name?: string;
  creator_surname?: string;
}

interface CompanyDocument {
  id: string;
  company_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface CompanyRevisionPreviewModalProps {
  revision: CompanyRevision | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CompanyRevisionPreviewModal = ({ revision, isOpen, onClose }: CompanyRevisionPreviewModalProps) => {
  if (!revision) return null;

  const formatJsonData = (data: any) => {
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) || [];
      } catch {
        return data.split(',').map((item: string) => item.trim()).filter(Boolean);
      }
    }
    return Array.isArray(data) ? data : [];
  };

  const cities = formatJsonData(revision.cities);
  const countries = formatJsonData(revision.countries);
  const certifications = formatJsonData(revision.certifications);
  const revenues = formatJsonData(revision.revenues);
  const mainCustomers = formatJsonData(revision.main_customers);

  const [companyDocuments, setCompanyDocuments] = React.useState<CompanyDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    const fetchCompanyDocuments = async () => {
      if (!revision?.company_id) return;
      setDocumentsLoading(true);
      try {
        const { data, error } = await supabase
          .from('company_documents')
          .select('*')
          .eq('company_id', revision.company_id)
          .order('created_at', { ascending: false });
        if (!error) setCompanyDocuments((data as any) || []);
      } finally {
        setDocumentsLoading(false);
      }
    };
    fetchCompanyDocuments();
  }, [revision?.company_id]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDocumentDownload = async (doc: CompanyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('company-documents')
        .download(doc.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="sr-only">Company Revision Preview</DialogTitle>
        </DialogHeader>

        {/* Replicate SupplierDetail Overview layout via shared components */}
        <Card className="shadow-sm border-0 bg-white">
          <CardContent className="p-8">
            {/* Header-like company name with Verified badge (matches page header styles) */}
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-5xl font-inter font-extrabold text-navy uppercase tracking-tight" style={{fontFamily: 'Inter, sans-serif', fontWeight: '800'}}>
                  {revision.nombre_empresa}
                </h1>
                {revision.source && revision.source.toLowerCase() === 'member' && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center justify-center w-[41px] h-[41px] cursor-help" aria-label="Verified" role="img">
                          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L19 5V11C19 15.97 16.11 20.44 12 22C7.89 20.44 5 15.97 5 11V5L12 2Z" fill="#80c8f0"/>
                            <path d="M16.59 8.58L10.25 14.92L7.41 12.08" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Company information was completed by the company and verified by FQ Source
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Left Column - Main Content (3/4 width) */}
              <CompanyOverviewLeft data={revision} />

              {/* Right Column - Contact Info and Logo (1/4 width) */}
              <div className="lg:col-span-1 space-y-6">
                {/* Company Logo */}
                {revision.logo && (
                  <div className="hidden lg:block">
                    <div className="w-28 h-28 mx-auto flex items-center justify-center bg-white border border-gray-200 rounded-3xl overflow-hidden">
                      <img src={revision.logo} alt={revision.nombre_empresa} className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}

                {/* Contact Information */}
                <CompanyOverviewRightContact data={revision} />

                {/* Company Documents */}
                {companyDocuments.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-navy mb-3">Company Documents</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {companyDocuments.map((doc) => (
                        <CompanyDocumentViewCard
                          key={doc.id}
                          document={doc as any}
                          onDownload={handleDocumentDownload as any}
                          formatFileSize={formatFileSize}
                        />
                      ))}
                    </div>
                    {documentsLoading && (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">Loading documents...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};