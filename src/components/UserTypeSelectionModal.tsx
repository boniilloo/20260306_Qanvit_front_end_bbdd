import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Users, Building2, Search, Plus } from 'lucide-react';

interface Company {
  id: string;
  nombre_empresa: string;
}

interface UserTypeSelectionModalProps {
  isOpen: boolean;
  userId: string;
  onComplete: () => void;
}

const UserTypeSelectionModal = ({ isOpen, userId, onComplete }: UserTypeSelectionModalProps) => {
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState<'buyer' | 'supplier' | ''>('');
  const [step, setStep] = useState<'selection' | 'supplier-details' | 'buyer-details' | 'add-company'>('selection');
  
  // Supplier states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Buyer states
  const [buyerCompanyName, setBuyerCompanyName] = useState('');
  const [buyerCompanyUrl, setBuyerCompanyUrl] = useState('');
  
  // Add company states
  const [newCompanyUrl, setNewCompanyUrl] = useState('');
  const [newCompanyComment, setNewCompanyComment] = useState('');

  // Search companies for supplier selection (server-side, avoids missing results due to default limits)
  useEffect(() => {
    if (step !== 'supplier-details') return;

    const query = searchQuery.trim();
    if (query.length < 2) {
      setCompanies([]);
      setSelectedCompanyId('');
      return;
    }

    const searchCompanies = async () => {
      setSearchLoading(true);
      try {
        const { data, error } = await supabase
          .from('company_revision')
          .select('id, nombre_empresa, company_id')
          .eq('is_active', true)
          .not('nombre_empresa', 'is', null)
          .ilike('nombre_empresa', `%${query}%`)
          .order('nombre_empresa')
          .limit(100);

        if (error) throw error;

        // Remove duplicates based on company_id and map to expected format
        const uniqueCompanies = (data || []).reduce((acc: Company[], current: any) => {
          if (!acc.find(c => c.id === current.company_id)) {
            acc.push({
              id: current.company_id,
              nombre_empresa: current.nombre_empresa
            });
          }
          return acc;
        }, []);

        setCompanies(uniqueCompanies);

        // If the selected company isn't in the new results, clear selection
        if (selectedCompanyId && !uniqueCompanies.some(c => c.id === selectedCompanyId)) {
          setSelectedCompanyId('');
        }
      } catch (error) {
        console.error('Error searching companies:', error);
        toast({
          title: "Error",
          description: "Failed to search companies. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchCompanies, 300);
    return () => clearTimeout(debounceTimer);
  }, [step, searchQuery, selectedCompanyId]);

  const handleUserTypeSelection = (type: 'buyer' | 'supplier') => {
    setUserType(type);
    if (type === 'buyer') {
      setStep('buyer-details');
    } else {
      setStep('supplier-details');
    }
  };

  const handleSupplierSubmit = async () => {
    if (!selectedCompanyId) {
      toast({
        title: "Error",
        description: "Please select a company.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedCompany = companies.find(c => c.id === selectedCompanyId);
      
      // First, create the user type selection
      const { error: userTypeError } = await supabase
        .from('user_type_selections')
        .insert({
          user_id: userId,
          user_type: 'supplier',
          company_id: selectedCompanyId,
          company_name: selectedCompany?.nombre_empresa || '',
        });

      if (userTypeError) throw userTypeError;

      // Then, create the company admin request (claim) with default values
      const { error: adminRequestError } = await supabase
        .from('company_admin_requests')
        .insert({
          user_id: userId,
          company_id: selectedCompanyId,
          linkedin_url: 'https://www.linkedin.com/in/pending-verification', // Default placeholder
          comments: 'Admin request created during account setup',
          documents: [] // No documents uploaded in this flow
        });

      if (adminRequestError) throw adminRequestError;

      toast({
        title: "Profile completed",
        description: "Your supplier profile has been set up and your company admin request has been submitted successfully. We'll review it and get back to you.",
      });

      onComplete();
    } catch (error) {
      console.error('Error saving supplier selection:', error);
      toast({
        title: "Error",
        description: "Failed to save your selection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyerSubmit = async () => {
    if (!buyerCompanyName.trim() || !buyerCompanyUrl.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_type_selections')
        .insert({
          user_id: userId,
          user_type: 'buyer',
          company_name: buyerCompanyName.trim(),
          company_url: buyerCompanyUrl.trim(),
        });

      if (error) throw error;

      toast({
        title: "Profile completed",
        description: "Your buyer profile has been set up successfully.",
      });

      onComplete();
    } catch (error) {
      console.error('Error saving buyer selection:', error);
      toast({
        title: "Error",
        description: "Failed to save your selection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompanyRequest = async () => {
    if (!newCompanyUrl.trim()) {
      toast({
        title: "Error",
        description: "Company URL is required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Add company request
      const { error: companyRequestError } = await supabase
        .from('company_requests')
        .insert({
          user_id: userId,
          url: newCompanyUrl.trim(),
          comment: newCompanyComment.trim() || null,
        });

      if (companyRequestError) throw companyRequestError;

      // Save user type selection without company_id (since it's not added yet)
      const { error: userTypeError } = await supabase
        .from('user_type_selections')
        .insert({
          user_id: userId,
          user_type: 'supplier',
          company_name: 'Pending company request',
          company_url: newCompanyUrl.trim(),
        });

      if (userTypeError) throw userTypeError;

      toast({
        title: "Request submitted",
        description: "Your company addition request has been submitted. We'll review it and add it to our database.",
      });

      onComplete();
    } catch (error) {
      console.error('Error submitting company request:', error);
      toast({
        title: "Error",
        description: "Failed to submit your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">What type of user are you?</h3>
        <p className="text-sm text-muted-foreground mb-6">
          This will help us customize your experience on the platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:bg-accent transition-colors" 
          onClick={() => handleUserTypeSelection('buyer')}
        >
          <CardHeader className="text-center">
            <Users className="w-12 h-12 mx-auto mb-2 text-primary" />
            <CardTitle className="text-lg">Buyer</CardTitle>
            <CardDescription>
              I'm looking for suppliers and services for my company
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-accent transition-colors"
          onClick={() => handleUserTypeSelection('supplier')}
        >
          <CardHeader className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-2 text-primary" />
            <CardTitle className="text-lg">Supplier</CardTitle>
            <CardDescription>
              I represent a company that provides products or services
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );

  const renderSupplierStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Select Your Company</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Find your company in our database or request to add it.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company-search">Search for your company</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              id="company-search"
              placeholder="Type company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {searchQuery.trim().length >= 2 && searchLoading && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Searching...</p>
          </div>
        )}

        {searchQuery.trim().length >= 2 && !searchLoading && companies.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
            <Label className="text-sm font-medium">Available companies:</Label>
            {companies.map((company) => (
              <div
                key={company.id}
                className={`p-3 rounded-md cursor-pointer border transition-colors ${
                  selectedCompanyId === company.id
                    ? 'bg-primary/10 border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
                onClick={() => setSelectedCompanyId(company.id)}
              >
                <div className="font-medium">{company.nombre_empresa}</div>
              </div>
            ))}
          </div>
        )}

        {searchQuery.trim().length >= 2 && !searchLoading && companies.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No companies found matching "{searchQuery}"</p>
            <p className="text-sm">You can request to add your company below.</p>
          </div>
        )}

        {/* Always show "Company not here?" option */}
        <div className="flex items-center justify-center gap-2 py-2">
          <p className="text-sm text-muted-foreground">Company not here?</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep('add-company')}
            className="h-auto px-2 py-1 text-sm text-muted-foreground hover:text-foreground border-muted-foreground/30"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add Company
          </Button>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleSupplierSubmit}
            disabled={!selectedCompanyId || loading}
            className="w-full"
          >
            {loading ? "Saving..." : "Confirm Selection"}
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={() => setStep('selection')}
          className="w-full"
        >
          Back
        </Button>
      </div>
    </div>
  );

  const renderBuyerStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Company Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Tell us about the company you work for.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="buyer-company-name">Company Name *</Label>
          <Input
            id="buyer-company-name"
            placeholder="Enter your company name"
            value={buyerCompanyName}
            onChange={(e) => setBuyerCompanyName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="buyer-company-url">Company Website *</Label>
          <Input
            id="buyer-company-url"
            type="url"
            placeholder="https://example.com"
            value={buyerCompanyUrl}
            onChange={(e) => setBuyerCompanyUrl(e.target.value)}
            required
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleBuyerSubmit}
            disabled={!buyerCompanyName.trim() || !buyerCompanyUrl.trim() || loading}
            className="flex-1"
          >
            {loading ? "Saving..." : "Complete Profile"}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStep('selection')}
            disabled={loading}
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );

  const renderAddCompanyStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Request Company Addition</h3>
        <p className="text-sm text-muted-foreground mb-6">
          We'll review your request and add the company to our database.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-company-url">Company URL *</Label>
          <Input
            id="new-company-url"
            type="url"
            placeholder="https://example.com"
            value={newCompanyUrl}
            onChange={(e) => setNewCompanyUrl(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-company-comment">Additional Comments (optional)</Label>
          <Textarea
            id="new-company-comment"
            placeholder="Add any additional information about this company..."
            value={newCompanyComment}
            onChange={(e) => setNewCompanyComment(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleAddCompanyRequest}
            disabled={!newCompanyUrl.trim() || loading}
            className="flex-1"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStep('supplier-details')}
            disabled={loading}
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );

  const getCurrentStepContent = () => {
    switch (step) {
      case 'selection':
        return renderSelectionStep();
      case 'supplier-details':
        return renderSupplierStep();
      case 'buyer-details':
        return renderBuyerStep();
      case 'add-company':
        return renderAddCompanyStep();
      default:
        return renderSelectionStep();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-2xl [&>button]:hidden" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Account Setup</DialogTitle>
          <DialogDescription>
            Complete your account setup to start using the platform.
          </DialogDescription>
        </DialogHeader>
        
        {getCurrentStepContent()}
      </DialogContent>
    </Dialog>
  );
};

export default UserTypeSelectionModal;