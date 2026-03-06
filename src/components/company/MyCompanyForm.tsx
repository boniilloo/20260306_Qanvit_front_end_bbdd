import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Clock, Edit3, Trash2, Plus, Download, ExternalLink, Loader2, CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SecureInput } from '@/components/ui/SecureInput';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EnhancedFileUpload from '@/components/chat/EnhancedFileUpload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
interface FormData {
  linkedinUrl: string;
  comments: string;
}
interface CompanyAdminRequest {
  id: string;
  company_id: string;
  linkedin_url: string;
  comments: string;
  status: string;
  created_at: string;
  rejection_reason?: string;
  documents?: string[];
  processed_by_name?: string;
  processed_by_surname?: string;
}
interface Company {
  id: string;
  company_id: string;
  nombre_empresa: string;
  slug?: string;
}
interface MyCompanyFormProps {
  onRequestSubmitted?: () => void;
  alwaysShowForm?: boolean; // When true, always show the form instead of existing request status
}

const MyCompanyForm: React.FC<MyCompanyFormProps> = ({ onRequestSubmitted, alwaysShowForm = false }) => {
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const [existingRequest, setExistingRequest] = useState<CompanyAdminRequest | null>(null);
  const [rejectedRequests, setRejectedRequests] = useState<CompanyAdminRequest[]>([]);
  const [rejectedRequestsCompanyData, setRejectedRequestsCompanyData] = useState<{[key: string]: Company}>({});
  const [requestCompanyData, setRequestCompanyData] = useState<Company | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Company request form states
  const [isCompanyRequestModalOpen, setIsCompanyRequestModalOpen] = useState(false);
  const [companyRequestUrl, setCompanyRequestUrl] = useState('');
  const [companyRequestComment, setCompanyRequestComment] = useState('');
  const [isSubmittingCompanyRequest, setIsSubmittingCompanyRequest] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: {
      errors
    }
  } = useForm<FormData>();
  const getCompanyData = async (companyId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from('company_revision').select('id, company_id, nombre_empresa, slug').eq('company_id', companyId).eq('is_active', true).maybeSingle();
      if (!error && data) {
        setRequestCompanyData(data as Company);
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      setRequestCompanyData(null);
    }
  };
  const downloadFile = async (fileName: string) => {
    try {
      const {
        data,
        error
      } = await supabase.storage.from('admin-request-docs').download(fileName);
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
  const navigateToSupplier = () => {
    if (requestCompanyData) {
      const identifier = requestCompanyData.slug || requestCompanyData.company_id;
      navigate(`/suppliers/${identifier}`);
    }
  };
  const handleEditRequest = () => {
    if (existingRequest) {
      // Pre-fill form with existing data
      setValue('linkedinUrl', existingRequest.linkedin_url);
      setValue('comments', existingRequest.comments || '');

      // Set existing files
      setExistingFiles(existingRequest.documents || []);

      // Set the current company as selected
      if (requestCompanyData) {
        setSelectedCompany(requestCompanyData);
      }

      // Enter edit mode
      setIsEditingRequest(true);
    }
  };
  const handleCancelEdit = () => {
    // Reset form
    reset();
    setUploadedFiles([]);
    setExistingFiles([]);
    setSelectedCompany(null);
    setIsEditingRequest(false);
  };
  const checkExistingRequest = async () => {
    try {
      // Get only pending or approved requests (most recent)
      const { data, error } = await supabase
        .from('company_admin_requests')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking existing request:', error);
        return;
      }

      if (data && data.length > 0) {
        const request = data[0];
        setExistingRequest(request);

        // Fetch company data
        if (request.company_id) {
          await getCompanyData(request.company_id);
        }
      } else {
        setExistingRequest(null);
        setRequestCompanyData(null);
      }
    } catch (error) {
      console.error('Error in checkExistingRequest:', error);
    }
  };

  const fetchRejectedRequests = async () => {
    try {
      // Get all rejected requests first
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
        const companyDataMap: {[key: string]: Company} = {};
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
                companyDataMap[request.company_id] = companyData as Company;
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

  useEffect(() => {
    if (user) {
      checkExistingRequest();
      fetchRejectedRequests();
    }
  }, [user]);
  const searchCompanies = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.from('company_revision').select('id, company_id, nombre_empresa').eq('is_active', true).ilike('nombre_empresa', `%${term}%`).limit(50);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching companies:', error);
      toast({
        title: "Error",
        description: "Failed to search companies",
        variant: "destructive"
      });
    } finally {
      setSearchLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCompanies(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company);
    setSearchTerm('');
    setSearchResults([]);
  };
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to submit a request",
        variant: "destructive"
      });
      return;
    }
    if (!isEditingRequest && !selectedCompany) {
      toast({
        title: "Error",
        description: "Please select a company first",
        variant: "destructive"
      });
      return;
    }
    if (isEditingRequest && !selectedCompany) {
      toast({
        title: "Error",
        description: "Please select a company for your request",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload files to Supabase Storage
      const documentUrls: string[] = [...existingFiles]; // Keep existing files

      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          const {
            data: uploadData,
            error: uploadError
          } = await supabase.storage.from('admin-request-docs').upload(fileName, file);
          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            toast({
              title: "Upload Error",
              description: `Failed to upload ${file.name}`,
              variant: "destructive"
            });
            return;
          }
          documentUrls.push(uploadData.path);
        }
      }
      if (isEditingRequest && existingRequest) {
        // Update existing request
        const {
          error
        } = await supabase.from('company_admin_requests').update({
          company_id: selectedCompany!.company_id,
          linkedin_url: data.linkedinUrl,
          comments: data.comments || null,
          documents: documentUrls
        }).eq('id', existingRequest.id);
        if (error) {
          console.error('Error updating admin request:', error);
          toast({
            title: "Error",
            description: "Could not update the admin request. Please try again.",
            variant: "destructive"
          });
          return;
        }
        toast({
          title: "Request updated",
          description: "Your admin request has been updated successfully."
        });

        // Exit edit mode and refresh data
        setIsEditingRequest(false);
        setUploadedFiles([]);
        setExistingFiles([]);
        setSelectedCompany(null);
        reset();
        await checkExistingRequest();
        
        // Call the callback if provided
        if (onRequestSubmitted) {
          onRequestSubmitted();
        }
      } else {
        // Create new request
        const {
          error
        } = await supabase.from('company_admin_requests').insert({
          user_id: user.id,
          company_id: selectedCompany!.company_id,
          linkedin_url: data.linkedinUrl,
          comments: data.comments || null,
          documents: documentUrls
        });
        if (error) {
          console.error('Error inserting admin request:', error);
          toast({
            title: "Error",
            description: "Could not submit the admin request. Please try again.",
            variant: "destructive"
          });
          return;
        }
        toast({
          title: "Request submitted",
          description: "Your admin request has been submitted successfully. We'll review it and get back to you."
        });

        // Reset form and refresh data
        reset();
        setUploadedFiles([]);
        setSelectedCompany(null);
        await checkExistingRequest();
        await fetchRejectedRequests();
        
        // Call the callback if provided
        if (onRequestSubmitted) {
          onRequestSubmitted();
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "Unexpected error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteRequest = async () => {
    if (!existingRequest) return;
    try {
      setIsDeleting(true);
      const {
        error
      } = await supabase.from('company_admin_requests').delete().eq('id', existingRequest.id);
      if (error) throw error;
      toast({
        title: "Request deleted",
        description: "Your admin request has been deleted successfully."
      });
      setExistingRequest(null);
      setRequestCompanyData(null);
      await fetchRejectedRequests();
    } catch (error) {
      console.error('Error deleting admin request:', error);
      toast({
        title: "Error",
        description: "Failed to delete admin request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };
  const handleSubmitCompanyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be authenticated to submit a request",
        variant: "destructive"
      });
      return;
    }
    if (!companyRequestUrl.trim()) {
      toast({
        title: "Error",
        description: "Company URL is required",
        variant: "destructive"
      });
      return;
    }
    setIsSubmittingCompanyRequest(true);
    try {
      const {
        error
      } = await supabase.from('company_requests').insert({
        user_id: user.id,
        url: companyRequestUrl.trim(),
        comment: companyRequestComment.trim() || null
      });
      if (error) {
        console.error('Error inserting company request:', error);
        toast({
          title: "Error",
          description: "Could not submit the request. Please try again.",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "Request submitted",
        description: "Your request to add the company has been submitted successfully. We'll review it and add the company to our database."
      });
      setCompanyRequestUrl('');
      setCompanyRequestComment('');
      setIsCompanyRequestModalOpen(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "Unexpected error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingCompanyRequest(false);
    }
  };

  // Show existing request status if not editing and not forced to show form
  if (existingRequest && !isEditingRequest && !alwaysShowForm) {
    return <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Request Status
          </CardTitle>
          <CardDescription>
            You have a company admin request
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={existingRequest.status === 'pending' ? 'secondary' : existingRequest.status === 'approved' ? 'default' : 'destructive'}>
              <Clock className="h-3 w-3 mr-1" />
              {existingRequest.status === 'pending' ? 'Pending Review' : existingRequest.status === 'approved' ? 'Approved' : 'Rejected'}
            </Badge>
            {existingRequest.status === 'pending' && <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleEditRequest}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  Edit Request
                </Button>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting}>
                      {isDeleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                      {isDeleting ? 'Deleting...' : 'Delete Request'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Admin Request</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete your admin request? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2">
                      <DialogTrigger asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogTrigger>
                      <Button variant="destructive" onClick={handleDeleteRequest} disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : 'Delete Request'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>}
          </div>
          <div className="space-y-3">
            {/* Company Name with Link */}
            {requestCompanyData && <div>
                <strong>Company: </strong>
                <button onClick={navigateToSupplier} className="text-primary hover:underline inline-flex items-center gap-1">
                  {requestCompanyData.nombre_empresa}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>}
            
            <p><strong>LinkedIn URL:</strong> {existingRequest.linkedin_url}</p>
            {existingRequest.comments && <p><strong>Comments:</strong> {existingRequest.comments}</p>}
            
            {/* Uploaded Documents */}
            {existingRequest.documents && Array.isArray(existingRequest.documents) && existingRequest.documents.length > 0 && <div>
                <strong>Uploaded Documents:</strong>
                <div className="mt-2 space-y-2">
                  {existingRequest.documents.map((filePath, index) => <button key={index} onClick={() => downloadFile(filePath)} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-muted transition-colors w-full text-left">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{filePath.split('/').pop() || filePath}</span>
                    </button>)}
                </div>
              </div>}
            
            <p><strong>Submitted:</strong> {new Date(existingRequest.created_at).toLocaleDateString()}</p>
            {existingRequest.rejection_reason && <p><strong>Rejection Reason:</strong> {existingRequest.rejection_reason}</p>}
          </div>
        </CardContent>
      </Card>;
  }

  // Main form for new requests or editing existing ones
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {isEditingRequest ? 'Edit Company Admin Request' : 'Request Company Admin Access'}
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="https://fqsource.com/help/supplier-profile" target="_blank" rel="noopener noreferrer" aria-label="Help" className="ml-1 inline-flex">
                    <CircleHelp className="w-5 h-5 text-foreground" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Help</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            {isEditingRequest ? 'Modify your existing admin request for the company' : 'Submit a request to become an admin for your company'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {isEditingRequest && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  You are editing your existing admin request. Make any changes needed and submit to update your request.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} className="mt-2">
                  Cancel Edit
                </Button>
              </div>}
            
            {/* Company Selection - Show for both new requests and editing */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-search">
                  {isEditingRequest ? 'Change Company (Optional)' : 'Search for your company'}
                </Label>
                {selectedCompany ? <div className="flex items-center justify-between p-3 border rounded-lg bg-muted">
                    <div className="flex flex-col">
                      <span className="font-medium">{selectedCompany.nombre_empresa}</span>
                      {isEditingRequest && <span className="text-sm text-muted-foreground">
                          {selectedCompany.company_id === requestCompanyData?.company_id ? 'Current company' : 'New company selected'}
                        </span>}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                  setSelectedCompany(null);
                  setSearchTerm('');
                  setSearchResults([]);
                }}>
                      Change
                    </Button>
                  </div> : <div className="space-y-2">
                    <div className="relative">
                      <Input placeholder={isEditingRequest ? "Search for a different company..." : "Search for your company..."} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                      {searchLoading && <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        </div>}
                    </div>
                    {searchResults.length > 0 && <div className="border rounded-lg bg-background max-h-48 overflow-y-auto">
                        {searchResults.map(company => <button key={company.id} type="button" onClick={() => handleCompanySelect(company)} className="w-full text-left p-3 hover:bg-muted transition-colors border-b last:border-b-0">
                            {company.nombre_empresa}
                          </button>)}
                      </div>}
                    {searchTerm && !searchLoading && searchResults.length === 0 && <div className="space-y-3">
                        <p className="text-sm text-muted-foreground p-2">
                          No companies found. Try a different search term.
                        </p>
                        <div className="px-2">
                          <Dialog open={isCompanyRequestModalOpen} onOpenChange={setIsCompanyRequestModalOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full">
                                <Plus className="h-3 w-3 mr-1" />
                                Can't find your company? Request to add it
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Request New Company</DialogTitle>
                                <DialogDescription>
                                  Provide the URL of the company you want us to add to our database.
                                </DialogDescription>
                              </DialogHeader>
                              <form onSubmit={handleSubmitCompanyRequest} className="space-y-4">
                                <div className="space-y-2">
                                  <Label htmlFor="companyUrl">Company URL *</Label>
                                  <Input id="companyUrl" type="text" placeholder="https://example.com" value={companyRequestUrl} onChange={e => setCompanyRequestUrl(e.target.value)} required disabled={isSubmittingCompanyRequest} />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="companyComment">Comment (optional)</Label>
                                  <Textarea id="companyComment" placeholder="Add any additional information about this company..." value={companyRequestComment} onChange={e => setCompanyRequestComment(e.target.value)} rows={3} disabled={isSubmittingCompanyRequest} />
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" onClick={() => {
                              setIsCompanyRequestModalOpen(false);
                              setCompanyRequestUrl('');
                              setCompanyRequestComment('');
                            }} disabled={isSubmittingCompanyRequest}>
                                    Cancel
                                  </Button>
                                  <Button type="submit" disabled={isSubmittingCompanyRequest || !companyRequestUrl.trim()}>
                                    {isSubmittingCompanyRequest ? "Submitting..." : "Submit Request"}
                                  </Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>}
                  </div>}
              </div>
              
              {!isEditingRequest}
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">Your LinkedIn User Profile URL <i>(to check your relationship with the company)</i></Label>
              <SecureInput id="linkedinUrl" validationType="linkedin" {...register('linkedinUrl')} placeholder="https://www.linkedin.com/in/your-profile" disabled={isSubmitting} />
              {errors.linkedinUrl && <p className="text-sm text-destructive">{errors.linkedinUrl.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="comments">Additional Comments (Optional)</Label>
              <Textarea id="comments" {...register('comments')} placeholder="Any additional information about your request..." disabled={isSubmitting} className="resize-none" rows={3} />
            </div>

            {/* File Upload */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Supporting Documents (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Upload documents that verify your role at the company (employment letter, business card, etc.)
                </p>
                
                {/* Show existing files */}
                {existingFiles.length > 0 && <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Files:</Label>
                    {existingFiles.map((filePath, index) => <div key={index} className="flex items-center gap-2 p-2 border rounded-lg bg-muted">
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">{filePath.split('/').pop() || filePath}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                    setExistingFiles(existingFiles.filter((_, i) => i !== index));
                  }}>
                          Remove
                        </Button>
                      </div>)}
                  </div>}
                
                <EnhancedFileUpload onFileSelect={file => setUploadedFiles(prev => [...prev, file])} onMultipleFileSelect={setUploadedFiles} maxFiles={5} maxSize={10} />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isSubmitting ? isEditingRequest ? 'Updating Request...' : 'Submitting Request...' : isEditingRequest ? 'Update Request' : 'Submit Request'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Rejected Requests Section - Only show when not in modal mode */}
      {rejectedRequests.length > 0 && !alwaysShowForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-destructive" />
              Rejected Requests
            </CardTitle>
            <CardDescription>
              Your previous admin requests that were rejected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rejectedRequests.map((request, index) => {
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
                            {request.documents.map((filePath, docIndex) => (
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
        </Card>
      )}
    </div>
  );
};
export default MyCompanyForm;