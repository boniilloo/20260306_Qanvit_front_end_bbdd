import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { secureStorageUtils } from '@/lib/secureStorage';

interface UserProfile {
  name: string | null;
  surname: string | null;
  company_position: string | null;
  company_id: string | null;
  avatar_url: string | null;
}

export function useUserProfile() {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  // Initialize to true to prevent race conditions - ProfileCompletionHandler waits for !isLoadingProfile
  // This ensures we don't check the profile until the hook has properly initialized
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  
  // Function to refresh profile data
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingProfile(true);
    try {
      const { data: userData, error } = await supabase
        .from('app_user')
        .select('name, surname, company_position, company_id, avatar_url')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }
      
      setUserProfile(userData);
      
      // Cache user profile data securely
      if (userData) {
        await secureStorageUtils.storeUserProfile(userData);
      }

      // If user has company_id, fetch company name
      if (userData?.company_id) {
        try {
          const { data: companyData, error: companyError } = await supabase
            .from('company_revision')
            .select('nombre_empresa')
            .eq('company_id', userData.company_id)
            .eq('is_active', true)
            .maybeSingle();

          if (companyError) {
            console.error('Error fetching company data:', companyError);
          } else {
            const companyNameData = companyData?.nombre_empresa || null;
            setCompanyName(companyNameData);
            // Cache company name securely
            const preferences = await secureStorageUtils.getInterfacePreferences() || {};
            if (companyNameData) {
              preferences.companyName = companyNameData;
              await secureStorageUtils.storeInterfacePreferences(preferences);
            } else {
              delete preferences.companyName;
              await secureStorageUtils.storeInterfacePreferences(preferences);
            }
          }
        } catch (companyError) {
          console.error('Error in company fetch:', companyError);
        }
      } else {
        setCompanyName(null);
        const preferences = await secureStorageUtils.getInterfacePreferences() || {};
        delete preferences.companyName;
        await secureStorageUtils.storeInterfacePreferences(preferences);
      }
    } catch (error) {
      console.error('Error in refreshProfile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Memoized cached data loader
  const loadCachedData = useMemo(() => {
    if (isInitialized) return null;
    
    const loadData = async () => {
      try {
        const profileData = await secureStorageUtils.getUserProfile();
        const companyData = await secureStorageUtils.getInterfacePreferences();
        
        return { profileData, companyData: companyData?.companyName };
      } catch (error) {
        console.error('Error loading cached data:', error);
        return { profileData: null, companyData: null };
      }
    };
    
    return loadData();
  }, [isInitialized]);

  // Load cached data on mount
  useEffect(() => {
    if (!isInitialized && loadCachedData) {
      loadCachedData.then(data => {
        if (data.profileData) {
          setUserProfile(data.profileData);
        }
        if (data.companyData) {
          setCompanyName(data.companyData);
        }
        setIsInitialized(true);
      }).catch(error => {
        console.error('Error loading cached data:', error);
        setIsInitialized(true);
      });
    }
  }, [loadCachedData, isInitialized]);

  // Handle user profile loading when auth state changes
  useEffect(() => {
    if (!isInitialized) return;
    
    let isActive = true;

    const loadUserProfile = async () => {
      if (!isActive) return;

      if (user) {
        // Always clear previous data when user changes
        setUserProfile(null);
        setCompanyName(null);
        setIsLoadingProfile(true);
        
        try {
          const { data: userData, error } = await supabase
            .from('app_user')
            .select('name, surname, company_position, company_id, avatar_url')
            .eq('auth_user_id', user.id)
            .maybeSingle();
          
          if (!isActive) return;
          
          if (error) {
            console.error('Error fetching user profile:', error);
            setIsLoadingProfile(false);
            return;
          }
          
          setUserProfile(userData);
          
          // Cache user profile data securely
          if (userData) {
            await secureStorageUtils.storeUserProfile(userData);
          }

          // If user has company_id, fetch company name
          if (userData?.company_id) {
            try {
              const { data: companyData, error: companyError } = await supabase
                .from('company_revision')
                .select('nombre_empresa')
                .eq('company_id', userData.company_id)
                .eq('is_active', true)
                .maybeSingle();

              if (!isActive) return;

              if (companyError) {
                console.error('Error fetching company data:', companyError);
              } else {
                const companyNameData = companyData?.nombre_empresa || null;
                setCompanyName(companyNameData);
                // Cache company name securely
                const preferences = await secureStorageUtils.getInterfacePreferences() || {};
                if (companyNameData) {
                  preferences.companyName = companyNameData;
                  await secureStorageUtils.storeInterfacePreferences(preferences);
                } else {
                  delete preferences.companyName;
                  await secureStorageUtils.storeInterfacePreferences(preferences);
                }
              }
            } catch (companyError) {
              console.error('Error in company fetch:', companyError);
            }
          } else {
            setCompanyName(null);
            const preferences = await secureStorageUtils.getInterfacePreferences() || {};
            delete preferences.companyName;
            await secureStorageUtils.storeInterfacePreferences(preferences);
          }
        } catch (error) {
          console.error('Error in loadUserProfile:', error);
        } finally {
          if (isActive) {
            setIsLoadingProfile(false);
          }
        }
      } else {
        setUserProfile(null);
        setCompanyName(null);
        setIsLoadingProfile(false);
        // Clear cached data when logged out
        await secureStorageUtils.clearUserData();
      }
    };

    loadUserProfile();
    
    return () => {
      isActive = false;
    };
  }, [user?.id, isInitialized]);

  return {
    userProfile,
    companyName,
    isLoadingProfile,
    refreshProfile
  };
}