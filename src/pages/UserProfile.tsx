import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu, Search, Check, Upload, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import InterfaceSettings from '@/components/settings/InterfaceSettings';
import NdaTemplateManager from '@/components/rfx/workflow/NdaTemplateManager';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useTranslation } from 'react-i18next';
interface Company {
  id: string;
  company_id: string;
  nombre_empresa: string;
}
const UserProfile = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    user,
    loading: authLoading
  } = useAuth();
  const {
    userProfile,
    companyName,
    isLoadingProfile,
    refreshProfile
  } = useUserProfile();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const isMobile = useIsMobile();

  // User data states
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    company_position: '',
    email: ''
  });

  // Stats states
  const [rfxsCount, setRfxsCount] = useState(0);
  const [savedSuppliersCount, setSavedSuppliersCount] = useState(0);
  const [conversationsCount, setConversationsCount] = useState(0);

  // Company search states
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showCompanySearch, setShowCompanySearch] = useState(false);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    uploading,
    uploadAvatar,
    deleteAvatar
  } = useAvatarUpload();

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
  }, [user, authLoading, navigate]);

  // Load additional user data and set form data when userProfile changes
  useEffect(() => {
    const loadAdditionalData = async () => {
      if (!user || !userProfile) return;
      try {
        // Set form data from userProfile
        setFormData({
          name: userProfile.name || '',
          surname: userProfile.surname || '',
          company_position: userProfile.company_position || '',
          email: user.email || ''
        });

        // Load company data if exists
        if (userProfile.company_id) {
          const {
            data: companyData,
            error: companyError
          } = await supabase.from('company_revision').select('id, company_id, nombre_empresa').eq('company_id', userProfile.company_id).eq('is_active', true).maybeSingle();
          if (!companyError && companyData) {
            setCurrentCompany(companyData);
            setSelectedCompany(companyData);
          }
        } else {
          setCurrentCompany(null);
          setSelectedCompany(null);
        }

        // Load RFXs count
        const {
          count: rfxsCountResult
        } = await supabase.from('rfxs' as any).select('*', {
          count: 'exact',
          head: true
        }).eq('user_id', user.id);
        setRfxsCount(rfxsCountResult || 0);

        // Load saved suppliers count
        const {
          count
        } = await supabase.from('saved_companies').select('*', {
          count: 'exact',
          head: true
        }).eq('user_id', user.id);
        setSavedSuppliersCount(count || 0);

        // Load conversations count
        const {
          count: conversationsCount
        } = await supabase.from('conversations').select('*', {
          count: 'exact',
          head: true
        }).eq('user_id', user.id);
        setConversationsCount(conversationsCount || 0);
      } catch (error) {
        console.error('Error loading additional data:', error);
      } finally {
        setLoading(false);
      }
    };
    if (user && userProfile) {
      loadAdditionalData();
    } else if (user && !isLoadingProfile) {
      // If we have user but no profile and not loading, we're done loading
      setLoading(false);
    }
  }, [user, userProfile, isLoadingProfile]);

  // Search companies
  useEffect(() => {
    const searchCompanies = async () => {
      if (searchTerm.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const {
          data,
          error
        } = await supabase.from('company_revision').select('id, company_id, nombre_empresa').eq('is_active', true).ilike('nombre_empresa', `%${searchTerm}%`).limit(10);
        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching companies:', error);
      } finally {
        setSearchLoading(false);
      }
    };
    const debounceTimer = setTimeout(searchCompanies, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      // Check if email has changed
      const emailChanged = user?.email !== formData.email.trim();

      // Update email in Supabase Auth if it changed
      if (emailChanged) {
        const {
          error: authError
        } = await supabase.auth.updateUser({
          email: formData.email.trim()
        });
        if (authError) {
          throw new Error(`Failed to update email in authentication: ${authError.message}`);
        }

        // Show notification about email verification
        toast({
          title: "Email update initiated",
          description: "Please check your new email address to confirm the change. Your profile has been updated."
        });
      }

      // Update profile data in app_user table
      const {
        error
      } = await supabase.from('app_user').update({
        name: formData.name.trim() || null,
        surname: formData.surname.trim() || null,
        company_position: formData.company_position.trim() || null,
        company_id: selectedCompany?.company_id || null
      }).eq('auth_user_id', user.id);
      if (error) throw error;

      // Show success message
      if (!emailChanged) {
        toast({
          title: "Profile updated",
          description: "Your profile has been updated successfully."
        });
      }

      // Update local state
      setCurrentCompany(selectedCompany);
      setShowCompanySearch(false);

      // Refresh the userProfile hook to update sidebar
      await refreshProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company);
    setSearchTerm(company.nombre_empresa);
    setShowCompanySearch(false);
  };
  const handleRemoveCompany = () => {
    setSelectedCompany(null);
    setSearchTerm('');
  };
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newAvatarUrl = await uploadAvatar(file);
    if (newAvatarUrl) {
      // Refresh profile to get updated avatar
      await refreshProfile();
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleAvatarDelete = async () => {
    if (!userProfile?.avatar_url) return;
    const success = await deleteAvatar(userProfile.avatar_url);
    if (success) {
      // Refresh profile to get updated avatar
      await refreshProfile();
    }
  };
  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fqblue mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>;
  }

  // If not authenticated, don't render anything (will redirect)
  if (!user) {
    return null;
  }
  return <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-navy font-intro">MY PROFILE</h1>
              <p className="text-gray-600 font-inter mt-2">Manage your account settings and preferences</p>
            </div>
            {/* User Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-3xl mx-auto">
              <Card className="bg-white shadow-fq rounded-fq">
                <CardContent className="p-6">
                  <div className="text-2xl font-bold text-navy font-intro mb-1">{rfxsCount}</div>
                  <div className="text-sm text-gray-600 font-inter">RFXs Created</div>
                </CardContent>
              </Card>
              <Card className="bg-white shadow-fq rounded-fq">
                <CardContent className="p-6">
                  <div className="text-2xl font-bold text-navy font-intro mb-1">{savedSuppliersCount}</div>
                  <div className="text-sm text-gray-600 font-inter">Suppliers Saved</div>
                </CardContent>
              </Card>
              <Card className="bg-white shadow-fq rounded-fq">
                <CardContent className="p-6">
                  <div className="text-2xl font-bold text-navy font-intro mb-1">{conversationsCount}</div>
                  <div className="text-sm text-gray-600 font-inter">Conversations</div>
                </CardContent>
              </Card>
            </div>
            {/* Tabbed Interface */}
            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="nda">{t('workflow.nda.template.userTabTitle')}</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Profile Information */}
                  <Card className="bg-white shadow-fq rounded-fq">
                    <CardHeader>
                      <CardTitle className="font-intro text-navy font-bold text-xl">PROFILE INFORMATION</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="flex items-center space-x-4 mb-6">
                          <UserAvatar src={userProfile?.avatar_url} name={userProfile?.name} surname={userProfile?.surname} size="xl" />
                          <div className="flex flex-col space-y-2">
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                            <Button type="button" variant="outline" className="font-inter" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                              <Upload className="w-4 h-4 mr-2" />
                              {uploading ? 'Uploading...' : 'Change Photo'}
                            </Button>
                            {userProfile?.avatar_url && <Button type="button" variant="outline" size="sm" className="font-inter text-red-600 border-red-200 hover:bg-red-50" onClick={handleAvatarDelete}>
                                <X className="w-4 h-4 mr-2" />
                                Remove Photo
                              </Button>}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <Label htmlFor="name" className="font-inter">First Name</Label>
                            <Input id="name" value={formData.name} onChange={e => setFormData(prev => ({
                          ...prev,
                          name: e.target.value
                        }))} className="font-inter" placeholder="Enter your first name" />
                          </div>
                          <div>
                            <Label htmlFor="surname" className="font-inter">Last Name</Label>
                            <Input id="surname" value={formData.surname} onChange={e => setFormData(prev => ({
                          ...prev,
                          surname: e.target.value
                        }))} className="font-inter" placeholder="Enter your last name" />
                          </div>
                          <div>
                            <Label htmlFor="position" className="font-inter">Position</Label>
                            <Input id="position" value={formData.company_position} onChange={e => setFormData(prev => ({
                          ...prev,
                          company_position: e.target.value
                        }))} className="font-inter" placeholder="Enter your position" />
                          </div>
                          <div>
                            <Label htmlFor="email" className="font-inter">Email</Label>
                            <Input id="email" type="email" value={formData.email} onChange={e => setFormData(prev => ({
                          ...prev,
                          email: e.target.value
                        }))} className="font-inter" placeholder="Enter your email" required />
                            {user?.email !== formData.email.trim() && formData.email.trim() && <p className="text-xs text-amber-600 mt-1 font-inter">
                                ⚠️ Changing your email will require verification of the new address
                              </p>}
                          </div>
                          
                        </div>
                        
                        {/* Save Button */}
                        <Button type="submit" disabled={saving} className="w-full">
                          {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="nda" className="space-y-6">
                <Card className="bg-white shadow-fq rounded-fq">
                  <CardHeader>
                    <CardTitle className="font-intro text-navy font-bold text-xl">
                      {t('workflow.nda.template.userSectionTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <NdaTemplateManager
                      scope={{ kind: 'user' }}
                      description={t('workflow.nda.template.userHelper') as string}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
        </div>
      </div>
    </div>;
};
export default UserProfile;