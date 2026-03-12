import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ExternalLink, Plus, Clock, CheckCircle, XCircle, Loader2, Edit, Trash2, ChevronRight, ChevronDown, Eye, FileText, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useUserAdminCompanies } from '@/hooks/useUserAdminCompanies';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import MyCompanyForm from './MyCompanyForm';
import { useMemo } from 'react';


const CompanyList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { companies, isLoading, error, refetch, hasApprovedCompanies } = useUserAdminCompanies();
  const [showValidationModal, setShowValidationModal] = useState<{[key: string]: boolean}>({});
  
  // New company request modal state
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  
  // Rejected requests state
  const [rejectedRequests, setRejectedRequests] = useState<any[]>([]);
  const [rejectedRequestsCompanyData, setRejectedRequestsCompanyData] = useState<{[key: string]: any}>({});
  const [isRejectedRequestsOpen, setIsRejectedRequestsOpen] = useState(false);

  const handleCompanyClick = (company: { company_id: string; company_slug?: string }) => {
    const identifier = company.company_slug || company.company_id;
    navigate(`/suppliers/${identifier}`);
  };

  const handleRFXClick = (company: { company_id: string; company_slug?: string }) => {
    const identifier = company.company_slug || company.company_id;
    navigate(`/suppliers/${identifier}?tab=manage&subtab=rfxs`);
  };

  const fetchRejectedRequests = async () => {
    if (!user) return;
    
    try {
      // Get all rejected requests
      const { data, error } = await supabase
        .from('company_admin_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'rejected')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching rejected requests:', error);
        return;
      }

      if (data && data.length > 0) {
        // Get processor names using the new function
        const transformedData = await Promise.all(
          data.map(async (request) => {
            let processed_by_name = undefined;
            let processed_by_surname = undefined;

            if (request.processed_by) {
              try {
                const { data: processorData } = await supabase
                  .rpc('get_company_admin_request_processor_name', {
                    processor_user_id: request.processed_by
                  });

                if (processorData && processorData.length > 0) {
                  processed_by_name = processorData[0].name;
                  processed_by_surname = processorData[0].surname;
                }
              } catch (error) {
                console.error('Error fetching processor name:', error);
              }
            }

            return {
              ...request,
              processed_by_name,
              processed_by_surname
            };
          })
        );

        setRejectedRequests(transformedData);
        
        // Fetch company data for each rejected request
        const companyDataMap: {[key: string]: any} = {};
        for (const request of data) {
          if (request.company_id) {
            try {
              const { data: companyData } = await supabase
                .from('company_revision')
                .select('id, company_id, nombre_empresa, slug')
                .eq('company_id', request.company_id)
                .eq('is_active', true)
                .maybeSingle();
              
              if (companyData) {
                companyDataMap[request.company_id] = companyData;
              }
            } catch (error) {
              console.error('Error fetching company data for rejected request:', error);
            }
          }
        }
        setRejectedRequestsCompanyData(companyDataMap);
      } else {
        setRejectedRequests([]);
        setRejectedRequestsCompanyData({});
      }
    } catch (error) {
      console.error('Error in fetchRejectedRequests:', error);
    }
  };


  const downloadFile = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('admin-request-docs')
        .download(fileName);
        
      if (error) {
        console.error('Error downloading file:', error);
        toast({
          title: "Error",
          description: "Failed to download file",
          variant: "destructive"
        });
        return;
      }
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.split('/').pop() || fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive"
      });
    }
  };




  useEffect(() => {
    if (user) {
      fetchRejectedRequests();
    }
  }, [user]);


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-red-600">
            <p>Error loading companies: {error}</p>
            <Button onClick={refetch} variant="outline" className="mt-4">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Company Button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            Manage your company admin access and request new permissions
          </p>
        </div>
        <Dialog open={isNewCompanyModalOpen} onOpenChange={setIsNewCompanyModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#22183a] hover:bg-[#22183a]/90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Request New Company
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request Company Admin Access</DialogTitle>
              <DialogDescription>
                Submit a request to become an admin for a new company
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <MyCompanyForm 
                alwaysShowForm={true}
                onRequestSubmitted={() => {
                  setIsNewCompanyModalOpen(false);
                  refetch();
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Companies List */}
      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Companies Yet</h3>
              <p className="mb-4">
                You haven't requested admin access for any companies yet.
              </p>
              <Button onClick={() => setIsNewCompanyModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Request Your First Company
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Approved Companies */}
          {companies.filter(company => company.request_status === 'approved').length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Approved Companies</h3>
              <div className="grid gap-4">
                {companies.filter(company => company.request_status === 'approved').map((company) => (
                  <Card key={company.company_id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(company.request_status)}
                            {company.company_logo && (
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                                <img 
                                  src={company.company_logo} 
                                  alt={`${company.company_name} logo`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div>
                              <h3 className="font-semibold text-lg">{company.company_name}</h3>
                              <p className="text-sm text-muted-foreground">
                                Requested: {new Date(company.request_created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(company.request_status)}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRFXClick(company)}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            RFXs
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCompanyClick(company)}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Manage
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Pending Requests */}
          {companies.filter(company => company.request_status === 'pending').length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Pending Requests</h3>
              <MyCompanyForm 
                alwaysShowForm={false}
                onRequestSubmitted={() => {
                  refetch();
                }}
              />
            </div>
          )}

          {/* Rejected Requests Section */}
          {rejectedRequests.length > 0 && (
            <Card>
              <Collapsible open={isRejectedRequestsOpen} onOpenChange={setIsRejectedRequestsOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-destructive" />
                        Rejected Requests
                      </div>
                      {isRejectedRequestsOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CardTitle>
                    <CardDescription>
                      Your previous admin requests that were rejected
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                <div className="space-y-4">
                  {rejectedRequests.map((request) => {
                    const companyData = rejectedRequestsCompanyData[request.company_id];
                    return (
                      <div key={request.id} className="border rounded-lg p-4 bg-muted/50">
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="destructive">
                            Rejected
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(request.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          {companyData && (
                            <div>
                              <strong>Company: </strong>
                              <button 
                                onClick={() => {
                                  const identifier = companyData.slug || companyData.company_id;
                                  navigate(`/suppliers/${identifier}`);
                                }} 
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {companyData.nombre_empresa}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          
                          <div>
                            <strong>LinkedIn URL: </strong>
                            <a href={request.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {request.linkedin_url}
                            </a>
                          </div>
                          
                          {request.comments && (
                            <div>
                              <strong>Comments: </strong>
                              <span>{request.comments}</span>
                            </div>
                          )}
                          
                          {request.rejection_reason && (
                            <div>
                              <strong>Rejection Reason: </strong>
                              <span className="text-destructive">{request.rejection_reason}</span>
                            </div>
                          )}
                          
                          {(request.processed_by_name || request.processed_by_surname) && (
                            <div>
                              <strong>Rejected by: </strong>
                              <span>{[request.processed_by_name, request.processed_by_surname].filter(Boolean).join(' ')}</span>
                            </div>
                          )}
                          
                          {/* Documents for rejected requests */}
                          {request.documents && Array.isArray(request.documents) && request.documents.length > 0 && (
                            <div>
                              <strong>Documents: </strong>
                              <div className="mt-1 space-y-1">
                                {request.documents.map((filePath: string, docIndex: number) => (
                                  <button 
                                    key={docIndex}
                                    onClick={() => downloadFile(filePath)} 
                                    className="flex items-center gap-1 text-primary hover:underline text-xs"
                                  >
                                    <Download className="h-3 w-3" />
                                    {filePath.split('/').pop() || filePath}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>
      )}

    </div>
  );
};

export default CompanyList;
