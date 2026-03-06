import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Track initialized users to prevent duplicate calls during the same session
  const initializedUserRef = React.useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Clear all cached data when user changes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          try {
            const { secureStorageUtils } = await import('@/lib/secureStorage');
            await secureStorageUtils.clearUserData();
            
            // Clear the cached private key when user changes
            const { clearSessionPrivateKey } = await import('@/hooks/useRFXCrypto');
            clearSessionPrivateKey();
            
            // Reset initialization tracking if user changes or signs out
            if (event === 'SIGNED_OUT' || (session?.user?.id && initializedUserRef.current !== session.user.id)) {
               initializedUserRef.current = null;
               const { userCrypto } = await import('@/lib/userCrypto');
               // Also clear the global set in userCrypto via a helper if we exposed one, 
               // but for now since it's a new session, the userCrypto module state will persist 
               // until page reload. We rely on the per-user check in initializedUsers set.
            }
          } catch (error) {
            console.error('Error clearing user data:', error);
          }
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Initialize user keys if they don't exist (on sign in)
        if (event === 'SIGNED_IN' && session?.user) {
          // Prevent duplicate initialization for the same user
          if (initializedUserRef.current === session.user.id) {
             return;
          }
          
          try {
            initializedUserRef.current = session.user.id;
            const { userCrypto } = await import('@/lib/userCrypto');
            await userCrypto.initializeUserKeys(session.user.id);
          } catch (error) {
            console.error('Error initializing user keys on login:', error);
            // Reset ref on error so we can retry later
            initializedUserRef.current = null;
            // Don't block login if key generation fails, but log the error
          }
        }

      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Initialize user keys if they don't exist (for existing session)
      if (session?.user) {
        // Prevent duplicate initialization for the same user
        if (initializedUserRef.current === session.user.id) {
           return;
        }

        try {
          initializedUserRef.current = session.user.id;
          const { userCrypto } = await import('@/lib/userCrypto');
          await userCrypto.initializeUserKeys(session.user.id);
        } catch (error) {
          console.error('Error initializing user keys on session check:', error);
          // Reset ref on error so we can retry later
          initializedUserRef.current = null;
          // Don't block session restoration if key generation fails, but log the error
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};