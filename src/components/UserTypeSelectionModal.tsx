import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'selection' | 'company-profile-details' | 'open-innovation-details' | 'add-company'>('selection');
  
  // Company profile management states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Open innovation challenge states
  const [buyerCompanyName, setBuyerCompanyName] = useState('');
  const [buyerCompanyUrl, setBuyerCompanyUrl] = useState('');
  
  // Add company states
  const [newCompanyUrl, setNewCompanyUrl] = useState('');
  const [newCompanyComment, setNewCompanyComment] = useState('');

  // Search companies for company profile management selection (server-side, avoids missing results due to default limits)
  useEffect(() => {
    if (step !== 'company-profile-details') return;

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
          title: t('onboardingIntent.errorTitle'),
          description: t('onboardingIntent.errorSearchCompanies'),
          variant: "destructive",
        });
      } finally {
        setSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchCompanies, 300);
    return () => clearTimeout(debounceTimer);
  }, [step, searchQuery, selectedCompanyId]);

  const handleUserTypeSelection = (type: 'open_innovation_challenges' | 'company_profile_management') => {
    if (type === 'open_innovation_challenges') {
      setStep('open-innovation-details');
    } else {
      setStep('company-profile-details');
    }
  };

  const handleCompanyProfileSubmit = async () => {
    if (!selectedCompanyId) {
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorSelectCompany'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedCompany = companies.find(c => c.id === selectedCompanyId);
      
      // First, create the onboarding intent selection
      const { error: userTypeError } = await supabase
        .from('user_type_selections')
        .insert({
          user_id: userId,
          user_type: 'company_profile_management',
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
        title: t('onboardingIntent.successProfileCompletedTitle'),
        description: t('onboardingIntent.successCompanyProfileFlow'),
      });

      onComplete();
    } catch (error) {
      console.error('Error saving company profile management selection:', error);
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorSaveSelection'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInnovationSubmit = async () => {
    if (!buyerCompanyName.trim() || !buyerCompanyUrl.trim()) {
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorFillRequiredFields'),
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
          user_type: 'open_innovation_challenges',
          company_name: buyerCompanyName.trim(),
          company_url: buyerCompanyUrl.trim(),
        });

      if (error) throw error;

      toast({
        title: t('onboardingIntent.successProfileCompletedTitle'),
        description: t('onboardingIntent.successOpenInnovationFlow'),
      });

      onComplete();
    } catch (error) {
      console.error('Error saving open innovation selection:', error);
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorSaveSelection'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompanyRequest = async () => {
    if (!newCompanyUrl.trim()) {
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorCompanyUrlRequired'),
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

      // Save onboarding intent without company_id (since it's not added yet)
      const { error: userTypeError } = await supabase
        .from('user_type_selections')
        .insert({
          user_id: userId,
          user_type: 'company_profile_management',
          company_name: 'Pending company request',
          company_url: newCompanyUrl.trim(),
        });

      if (userTypeError) throw userTypeError;

      toast({
        title: t('onboardingIntent.successRequestSubmittedTitle'),
        description: t('onboardingIntent.successCompanyAdditionRequest'),
      });

      onComplete();
    } catch (error) {
      console.error('Error submitting company request:', error);
      toast({
        title: t('onboardingIntent.errorTitle'),
        description: t('onboardingIntent.errorSubmitRequest'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">{t('onboardingIntent.selectionTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t('onboardingIntent.selectionDescription')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:bg-accent transition-colors" 
          onClick={() => handleUserTypeSelection('open_innovation_challenges')}
        >
          <CardHeader className="text-center">
            <Users className="w-12 h-12 mx-auto mb-2 text-primary" />
            <CardTitle className="text-lg">{t('onboardingIntent.openInnovationCardTitle')}</CardTitle>
            <CardDescription>
              {t('onboardingIntent.openInnovationCardDescription')}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-accent transition-colors"
          onClick={() => handleUserTypeSelection('company_profile_management')}
        >
          <CardHeader className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-2 text-primary" />
            <CardTitle className="text-lg">{t('onboardingIntent.companyProfileCardTitle')}</CardTitle>
            <CardDescription>
              {t('onboardingIntent.companyProfileCardDescription')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );

  const renderCompanyProfileStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">{t('onboardingIntent.companyProfileStepTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t('onboardingIntent.companyProfileStepDescription')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company-search">{t('onboardingIntent.searchCompanyLabel')}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              id="company-search"
              placeholder={t('onboardingIntent.searchCompanyPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {searchQuery.trim().length >= 2 && searchLoading && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">{t('onboardingIntent.searching')}</p>
          </div>
        )}

        {searchQuery.trim().length >= 2 && !searchLoading && companies.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
            <Label className="text-sm font-medium">{t('onboardingIntent.availableCompanies')}</Label>
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
            <p>{t('onboardingIntent.noCompaniesFound', { query: searchQuery })}</p>
            <p className="text-sm">{t('onboardingIntent.noCompaniesFoundDescription')}</p>
          </div>
        )}

        {/* Always show "Company not here?" option */}
        <div className="flex items-center justify-center gap-2 py-2">
          <p className="text-sm text-muted-foreground">{t('onboardingIntent.companyNotHere')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep('add-company')}
            className="h-auto px-2 py-1 text-sm text-muted-foreground hover:text-foreground border-muted-foreground/30"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            {t('onboardingIntent.addCompany')}
          </Button>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleCompanyProfileSubmit}
            disabled={!selectedCompanyId || loading}
            className="w-full"
          >
            {loading ? t('onboardingIntent.saving') : t('onboardingIntent.confirmSelection')}
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={() => setStep('selection')}
          className="w-full"
        >
          {t('onboardingIntent.back')}
        </Button>
      </div>
    </div>
  );

  const renderOpenInnovationStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">{t('onboardingIntent.openInnovationStepTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t('onboardingIntent.openInnovationStepDescription')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="buyer-company-name">{t('onboardingIntent.companyNameLabel')}</Label>
          <Input
            id="buyer-company-name"
            placeholder={t('onboardingIntent.companyNamePlaceholder')}
            value={buyerCompanyName}
            onChange={(e) => setBuyerCompanyName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="buyer-company-url">{t('onboardingIntent.companyWebsiteLabel')}</Label>
          <Input
            id="buyer-company-url"
            type="url"
            placeholder={t('onboardingIntent.urlPlaceholder')}
            value={buyerCompanyUrl}
            onChange={(e) => setBuyerCompanyUrl(e.target.value)}
            required
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleOpenInnovationSubmit}
            disabled={!buyerCompanyName.trim() || !buyerCompanyUrl.trim() || loading}
            className="flex-1"
          >
            {loading ? t('onboardingIntent.saving') : t('onboardingIntent.completeProfile')}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStep('selection')}
            disabled={loading}
          >
            {t('onboardingIntent.back')}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderAddCompanyStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">{t('onboardingIntent.requestCompanyAdditionTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t('onboardingIntent.requestCompanyAdditionDescription')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-company-url">{t('onboardingIntent.companyUrlLabel')}</Label>
          <Input
            id="new-company-url"
            type="url"
            placeholder={t('onboardingIntent.urlPlaceholder')}
            value={newCompanyUrl}
            onChange={(e) => setNewCompanyUrl(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-company-comment">{t('onboardingIntent.additionalCommentsLabel')}</Label>
          <Textarea
            id="new-company-comment"
            placeholder={t('onboardingIntent.additionalCommentsPlaceholder')}
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
            {loading ? t('onboardingIntent.submitting') : t('onboardingIntent.submitRequest')}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStep('company-profile-details')}
            disabled={loading}
          >
            {t('onboardingIntent.back')}
          </Button>
        </div>
      </div>
    </div>
  );

  const getCurrentStepContent = () => {
    switch (step) {
      case 'selection':
        return renderSelectionStep();
      case 'company-profile-details':
        return renderCompanyProfileStep();
      case 'open-innovation-details':
        return renderOpenInnovationStep();
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
          <DialogTitle>{t('onboardingIntent.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('onboardingIntent.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        
        {getCurrentStepContent()}
      </DialogContent>
    </Dialog>
  );
};

export default UserTypeSelectionModal;