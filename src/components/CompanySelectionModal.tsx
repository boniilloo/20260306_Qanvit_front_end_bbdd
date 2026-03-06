import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search } from 'lucide-react';

interface Company {
  id: string;
  company_id: string;
  nombre_empresa: string;
}

interface CompanySelectionModalProps {
  isOpen: boolean;
  userId: string;
  onComplete: () => void;
  onSkip: () => void;
}

const CompanySelectionModal = ({ isOpen, userId, onComplete, onSkip }: CompanySelectionModalProps) => {
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Search companies when search term changes
  useEffect(() => {
    const searchCompanies = async () => {
      if (searchTerm.trim().length < 2) {
        setCompanies([]);
        return;
      }

      setSearchLoading(true);
      try {
        const { data, error } = await supabase
          .from('company_revision')
          .select('id, company_id, nombre_empresa')
          .eq('is_active', true)
          .ilike('nombre_empresa', `%${searchTerm}%`)
          .limit(10);

        if (error) {
          throw error;
        }

        setCompanies(data || []);
      } catch (error) {
        console.error('Error searching companies:', error);
        toast({
          title: "Error",
          description: "Error searching companies. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchCompanies, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompany) {
      toast({
        title: "Error",
        description: "Please select a company.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('app_user')
        .update({
          company_id: selectedCompany.company_id,
        })
        .eq('auth_user_id', userId);

      if (error) {
        throw error;
      }

      toast({
        title: "Company selected",
        description: "Your company has been selected successfully.",
      });

      onComplete();
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        title: "Error",
        description: "Failed to select company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Select Your Company</DialogTitle>
          <DialogDescription>
            Please search and select your company to continue using the application.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-search">Search Company *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="company-search"
                type="text"
                placeholder="Type company name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          {/* Search Results */}
          {searchTerm.length >= 2 && (
            <div className="space-y-2">
              <Label>Search Results</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {searchLoading ? (
                  <div className="p-3 text-sm text-gray-500">Searching...</div>
                ) : companies.length > 0 ? (
                  companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setSelectedCompany(company)}
                      className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                        selectedCompany?.id === company.id ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="font-medium text-sm">{company.nombre_empresa}</div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-sm text-gray-500">No companies found</div>
                )}
              </div>
            </div>
          )}

          {/* Selected Company */}
          {selectedCompany && (
            <div className="space-y-2">
              <Label>Selected Company</Label>
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="font-medium text-sm text-green-800">
                  {selectedCompany.nombre_empresa}
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={onSkip}
              disabled={loading}
            >
              Skip for now
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={loading || !selectedCompany}
            >
              {loading ? "Saving..." : "Select Company"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CompanySelectionModal;