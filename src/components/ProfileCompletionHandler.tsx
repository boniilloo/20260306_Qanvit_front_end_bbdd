import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';
import ProfileCompletionModal from '@/components/ProfileCompletionModal';
import CompanySelectionModal from '@/components/CompanySelectionModal';
import UserTypeSelectionModal from '@/components/UserTypeSelectionModal';
import OnboardingTour from '@/components/onboarding/OnboardingTour';

const ProfileCompletionHandler = () => {
  const { user, loading: authLoading } = useAuth();
  const { refreshProfile, isLoadingProfile } = useUserProfile();
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showUserTypeModal, setShowUserTypeModal] = useState(false);
  const [userProfileData, setUserProfileData] = useState<{
    name?: string | null;
    surname?: string | null;
    company_position?: string | null;
    company_id?: string | null;
  }>({});
  
  // Track if we've already checked the profile for this user session
  const hasCheckedProfile = useRef(false);
  const currentUserId = useRef<string | null>(null);

  const checkUserProfile = useCallback(async (userId: string) => {
    // Mark as checked immediately when we actually start the check
    hasCheckedProfile.current = true;
    
    try {
      // Check if user exists in app_user table
      const { data: userData, error } = await supabase
        .from('app_user')
        .select('name, surname, company_position, company_id, onboarding_completed')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking user profile:', error);
        return;
      }

      // If user doesn't exist in app_user table, create record
      if (!userData) {
        const { error: insertError } = await supabase
          .from('app_user')
          .insert({
            auth_user_id: userId,
            name: null,
            surname: null,
            company_position: null,
            company_id: null,
            onboarding_completed: false
          });

        if (insertError) {
          console.error('Error creating user profile:', insertError);
          return;
        }

        // Initialize keys for new user
        await userCrypto.initializeUserKeys(userId, { isNewUser: true });

        // Show onboarding tour first for new users
        setShowOnboardingTour(true);
        return;
      }

      // Ensure keys exist for existing users
      await userCrypto.initializeUserKeys(userId);

      // Check if onboarding is incomplete - THIS MUST HAPPEN FIRST
      if (!userData.onboarding_completed) {
        setShowOnboardingTour(true);
        return;
      }

      // Check if profile is incomplete
      if (!userData.name || !userData.surname || !userData.company_position) {
        setUserProfileData(userData);
        setShowProfileModal(true);
        return;
      }

      // Profile is complete - now check if user type selection is complete
      const { data: userTypeData, error: userTypeError } = await supabase
        .from('user_type_selections')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (userTypeError) {
        console.error('Error checking user type:', userTypeError);
        return;
      }

      if (!userTypeData) {
        setShowUserTypeModal(true);
        return;
      }
    } catch (error) {
      console.error('Error in checkUserProfile:', error);
    }
  }, [refreshProfile]);

  const handleProfileCompletion = async () => {
    setShowProfileModal(false);
    
    // Refresh user profile data in the useUserProfile hook
    await refreshProfile();
    
    // Reset the flag to allow checking for other modals (user type, company)
    hasCheckedProfile.current = false;
    
    // After profile completion, check if company needs to be selected
    if (user) {
      checkUserProfile(user.id);
    }
  };

  const handleCompanySelection = () => {
    setShowCompanyModal(false);
  };

  const handleCompanySkip = () => {
    setShowCompanyModal(false);
  };

  const handleUserTypeCompletion = () => {
    setShowUserTypeModal(false);
  };

  const handleOnboardingCompletion = () => {
    setShowOnboardingTour(false);
    
    // Reset the flag to allow checking for other modals (profile, user type)
    hasCheckedProfile.current = false;
    
    // After onboarding completion, check what's next (profile or user type)
    if (user) {
      checkUserProfile(user.id);
    }
  };

  useEffect(() => {
    // Reset the check flag when user changes
    if (currentUserId.current !== user?.id) {
      hasCheckedProfile.current = false;
      currentUserId.current = user?.id || null;
    }
    
    // Only proceed if:
    // 1. User exists
    // 2. Auth is not loading
    // 3. User profile is not loading
    // 4. We haven't checked the profile yet for this user session
    if (user && !authLoading && !isLoadingProfile && !hasCheckedProfile.current) {
      // Add a small delay to ensure database consistency
      const timer = setTimeout(() => {
        checkUserProfile(user.id);
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [user, authLoading, isLoadingProfile, checkUserProfile]);

  // Listen for restart onboarding event
  useEffect(() => {
    const handleRestartOnboarding = () => {
      if (user) {
        // Reset the check flag to allow re-checking
        hasCheckedProfile.current = false;
        // Force check profile again, which will show onboarding if it's now false
        checkUserProfile(user.id);
      } else {
        // For non-authenticated users, just show the onboarding tour
        setShowOnboardingTour(true);
      }
    };

    window.addEventListener('restart-onboarding', handleRestartOnboarding);
    return () => {
      window.removeEventListener('restart-onboarding', handleRestartOnboarding);
    };
  }, [user, checkUserProfile]);

  return (
    <>
      {/* Onboarding Tour - MUST BE FIRST */}
      <OnboardingTour
        isOpen={showOnboardingTour}
        userId={user?.id}
        onComplete={handleOnboardingCompletion}
      />

      {/* Profile Completion Modal - Only for authenticated users */}
      {user && (
        <ProfileCompletionModal
          isOpen={showProfileModal}
          userId={user.id}
          currentData={userProfileData}
          onComplete={handleProfileCompletion}
        />
      )}

      {/* User Type Selection Modal - Only for authenticated users */}
      {user && (
        <UserTypeSelectionModal
          isOpen={showUserTypeModal}
          userId={user.id}
          onComplete={handleUserTypeCompletion}
        />
      )}

      {/* Company Selection Modal - Only for authenticated users */}
      {user && (
        <CompanySelectionModal
          isOpen={showCompanyModal}
          userId={user.id}
          onComplete={handleCompanySelection}
          onSkip={handleCompanySkip}
        />
      )}
    </>
  );
};

export default ProfileCompletionHandler;