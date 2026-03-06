import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MyCompanyForm from '@/components/company/MyCompanyForm';
import CompanyList from '@/components/company/CompanyList';
import { useUserAdminCompanies } from '@/hooks/useUserAdminCompanies';

const MyCompany = () => {
  const { companies, isLoading } = useUserAdminCompanies();
  const navigate = useNavigate();

  // Note: We no longer redirect automatically to supplier page
  // Instead, we show the company list where users can choose which company to manage

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  // Show company list if user has any admin requests (approved, pending, or rejected)
  // Only show the simple form if user has no requests at all
  const hasAnyRequests = companies && companies.length > 0;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-3xl font-extrabold text-foreground">My Company</h1>
        </div>
        {hasAnyRequests ? <CompanyList /> : <MyCompanyForm />}
      </div>
    </div>
  );
};

export default MyCompany;
