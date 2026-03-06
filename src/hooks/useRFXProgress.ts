import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RFXProgressData } from '@/components/rfx/RFXProgress';
import { useRFXValidations } from './useRFXValidations';
import { useRFXCrypto } from './useRFXCrypto';

interface PublicCryptoContext {
  encrypt: (text: string) => Promise<string>;
  decrypt: (text: string) => Promise<string>;
  encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
  decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  isLoading: boolean;
  isReady: boolean;
  isEncrypted: boolean;
  hasKey: boolean;
  error: string | null;
}

export const useRFXProgress = (rfxId: string | undefined, publicCrypto?: PublicCryptoContext) => {
  const [progressData, setProgressData] = useState<RFXProgressData>({
    specsCompletion: {
      description: false,
      technical_requirements: false,
      company_requirements: false
    },
    candidatesCompletion: false,
    candidatesProgress: {
      hasEvaluationResults: false,
      hasSelectedCandidates: false
    },
    validationProgress: {
      totalMembers: 0,
      validatedMembers: 0,
      allMembersValidated: false
    }
  });
  const [loading, setLoading] = useState(true);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const inFlightRef = useRef(false);
  const lastProgressSignatureRef = useRef<string>('');
  const loadingStartRef = useRef<number | null>(null);

  // Use the existing validation hook only when rfxId is defined
  const validationHook = useRFXValidations(rfxId || '');
  const { members, validations, allMembersValidated } = rfxId ? validationHook : { members: [], validations: [], allMembersValidated: false };
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : (rfxId || null));
  const activeCrypto = publicCrypto || privateCrypto;
  const { decrypt, isLoading: isCryptoLoading, isEncrypted, isReady } = activeCrypto;

  const startLoading = () => {
    if (!loadingStartRef.current) {
      loadingStartRef.current = Date.now();
    }
    setLoading(true);
  };

  const stopLoading = () => {
    const minDuration = 1000;
    const start = loadingStartRef.current;
    if (!start) {
      setLoading(false);
      return;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= minDuration) {
      setLoading(false);
      loadingStartRef.current = null;
    } else {
      setTimeout(() => {
        setLoading(false);
        loadingStartRef.current = null;
      }, minDuration - elapsed);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Initialization effect
  }, [rfxId]);

  // Keep latest validation data in refs to avoid stale closures inside callbacks
  const membersRef = useRef(members);
  const validationsRef = useRef(validations);
  const allMembersValidatedRef = useRef(allMembersValidated);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { validationsRef.current = validations; }, [validations]);
  useEffect(() => { allMembersValidatedRef.current = allMembersValidated; }, [allMembersValidated]);

  const fetchProgressData = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    let skipFinalize = false;
    try {
      inFlightRef.current = true;
      startLoading();
      setIsDecrypting(false);

      // Fetch specs completion
      const { data: specsData } = await supabase
        .from('rfx_specs')
        .select('description, technical_requirements, company_requirements')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      // Fetch evaluation results (candidates evaluated by FQ Agent)
      const { data: evaluationData } = await supabase
        .from('rfx_evaluation_results')
        .select('id')
        .eq('rfx_id', rfxId)
        .limit(1);

      // Fetch selected candidates (candidates selected by user)
      const { data: selectedData } = await supabase
        .from('rfx_selected_candidates')
        .select('id, selected')
        .eq('rfx_id', rfxId)
        .limit(1);

      // Fetch company invitations as fallback signal that candidates were selected and sent
      const { data: invitedCompanies } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id')
        .eq('rfx_id', rfxId)
        .limit(1);
      const hasInvitedCompanies = !!(invitedCompanies && invitedCompanies.length > 0);

      // Calculate completion status
      const specsCompletion = {
        description: !!(specsData?.description?.trim()),
        technical_requirements: !!(specsData?.technical_requirements?.trim()),
        company_requirements: !!(specsData?.company_requirements?.trim())
      };

      const hasEvaluationResults = !!(evaluationData && evaluationData.length > 0);
      // hasSelectedCandidates is true only if the record exists AND the selected array has at least one candidate
      let hasSelectedCandidates = false;
      
      if (selectedData && selectedData.length > 0 && selectedData[0]?.selected) {
        const selectedField = selectedData[0].selected;
        
        // Check if data is encrypted (can be string or object if Supabase auto-parsed JSONB)
        if (decrypt && isEncrypted) {
          try {
            let decryptedSelected: any = null;
            
            if (typeof selectedField === 'string') {
              // Encrypted data as string
              try {
                const parsed = JSON.parse(selectedField);
                const looksEncryptedString = !!(parsed && typeof parsed === 'object' && parsed.iv && parsed.data);
                // If it looks encrypted but crypto keys are still loading, wait before trying to decrypt
                if (looksEncryptedString && isCryptoLoading) {
                  setIsDecrypting(true);
                  skipFinalize = true;
                  return;
                }
                // If it looks encrypted but we don't have a key (isEncrypted === false),
                // we can't decrypt but we DO know there is a saved selection.
                if (looksEncryptedString && !isEncrypted) {
                  hasSelectedCandidates = true;
                  return;
                }
                // Check if it's encrypted format
                if (looksEncryptedString) {
                  // It's encrypted, decrypt it recursively until we get the actual data
                  let currentData: any = selectedField;
                  let decryptionAttempts = 0;
                  const maxAttempts = 5; // Prevent infinite loops
                  
                  while (decryptionAttempts < maxAttempts) {
                    try {
                      const parsedData = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                      
                      // Check if still encrypted
                      if (parsedData && typeof parsedData === 'object' && parsedData.iv && parsedData.data) {
                        const dataToDecrypt = typeof currentData === 'string' ? currentData : JSON.stringify(parsedData);
                        const decryptedStr = await decrypt(dataToDecrypt);
                        currentData = decryptedStr;
                        decryptionAttempts++;
                      } else {
                        // No longer encrypted, break
                        decryptedSelected = parsedData;
                        break;
                      }
                    } catch (e) {
                      // If parsing fails, try to use currentData as is
                      decryptedSelected = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                      break;
                    }
                  }
                  
                  if (decryptionAttempts >= maxAttempts) {
                    decryptedSelected = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                  }
                } else {
                  // Not encrypted, use parsed value
                  decryptedSelected = parsed;
                }
              } catch (e) {
                // If parsing fails, try to decrypt directly
                const decryptedSelectedStr = await decrypt(selectedField);
                decryptedSelected = JSON.parse(decryptedSelectedStr);
              }
            } else if (selectedField && typeof selectedField === 'object' && !Array.isArray(selectedField)) {
              // Supabase auto-parsed JSONB - check if it has encrypted format
              if (selectedField.iv && selectedField.data && !Array.isArray(selectedField)) {
                if (isCryptoLoading) {
                  setIsDecrypting(true);
                  skipFinalize = true;
                  return;
                }
                if (!isEncrypted) {
                  hasSelectedCandidates = true;
                  return;
                }
                // Re-stringify to get the encrypted JSON string format
                let currentData: any = JSON.stringify(selectedField);
                let decryptionAttempts = 0;
                const maxAttempts = 5; // Prevent infinite loops
                
                while (decryptionAttempts < maxAttempts) {
                  try {
                    const parsedData = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                    
                    // Check if still encrypted
                    if (parsedData && typeof parsedData === 'object' && parsedData.iv && parsedData.data) {
                      const dataToDecrypt = typeof currentData === 'string' ? currentData : JSON.stringify(parsedData);
                      const decryptedStr = await decrypt(dataToDecrypt);
                      currentData = decryptedStr;
                      decryptionAttempts++;
                    } else {
                      // No longer encrypted, break
                      decryptedSelected = parsedData;
                      break;
                    }
                  } catch (e) {
                    // If parsing fails, try to use currentData as is
                    decryptedSelected = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                    break;
                  }
                }
                
                if (decryptionAttempts >= maxAttempts) {
                  decryptedSelected = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
                }
              } else {
                // Not encrypted, use as is
                decryptedSelected = selectedField;
              }
            } else {
              // Already an array or other type, use as is
              decryptedSelected = selectedField;
            }
            
            // Check if decryptedSelected is an array directly, or if it's an object containing an array
            let candidatesArray: any[] = [];
            if (Array.isArray(decryptedSelected)) {
              candidatesArray = decryptedSelected;
            } else if (decryptedSelected && typeof decryptedSelected === 'object') {
              // Check common property names that might contain the array
              if (Array.isArray(decryptedSelected.selected)) {
                candidatesArray = decryptedSelected.selected;
              } else if (Array.isArray(decryptedSelected.candidates)) {
                candidatesArray = decryptedSelected.candidates;
              } else if (Array.isArray(decryptedSelected.data)) {
                candidatesArray = decryptedSelected.data;
              } else {
                // Try to find any array property
                const arrayKeys = Object.keys(decryptedSelected).filter(key => 
                  Array.isArray(decryptedSelected[key])
                );
                if (arrayKeys.length > 0) {
                  candidatesArray = decryptedSelected[arrayKeys[0]];
                }
              }
            }
            
            hasSelectedCandidates = candidatesArray.length > 0;
          } catch (err) {
            // If decryption fails, check if it's a non-empty string/object
            if (typeof selectedField === 'string') {
              hasSelectedCandidates = selectedField.length > 0;
            } else if (Array.isArray(selectedField)) {
              hasSelectedCandidates = selectedField.length > 0;
            } else {
              hasSelectedCandidates = false;
            }
          }
        } else {
          // No decrypt function available OR no encryption key for this RFX.
          // If the field already looks encrypted (stringified { iv, data } or object with iv/data),
          // we can't decrypt but we *do* know there is a selection saved, so we treat it as "has candidates".
          let looksEncrypted = false;
          if (typeof selectedField === 'string') {
            try {
              const parsed = JSON.parse(selectedField);
              looksEncrypted = !!(parsed && typeof parsed === 'object' && parsed.iv && parsed.data);
            } catch {
              looksEncrypted = false;
            }
          } else if (selectedField && typeof selectedField === 'object' && !Array.isArray(selectedField)) {
            looksEncrypted = !!(selectedField.iv && selectedField.data);
          }

          if (looksEncrypted) {
            hasSelectedCandidates = true;
          } else {
            hasSelectedCandidates = Array.isArray(selectedField) && selectedField.length > 0;
          }
        }
      }
      
      // If we couldn't decrypt/find selected candidates but there are invitations,
      // treat the step as completed (the invitation flow requires a selection).
      if (!hasSelectedCandidates && hasInvitedCompanies) {
        hasSelectedCandidates = true;
      }
      
      // candidatesCompletion is true only when candidates are selected (100% complete)
      const candidatesCompletion = hasSelectedCandidates;

      // Calculate validation progress
      const totalMembers = membersRef.current.length;
      const validatedMembers = validationsRef.current.filter(v => v.is_valid).length;

      const finalProgressData = {
        specsCompletion,
        candidatesCompletion,
        candidatesProgress: {
          hasEvaluationResults,
          hasSelectedCandidates
        },
        validationProgress: {
          totalMembers,
          validatedMembers,
          allMembersValidated: allMembersValidatedRef.current
        }
      };

      // Avoid setting state if nothing actually changed
      const signature = JSON.stringify(finalProgressData);
      if (signature === lastProgressSignatureRef.current) {
        // No changes, skip state update
      } else {
        lastProgressSignatureRef.current = signature;
        setProgressData(finalProgressData);
      }
    } catch (error) {
      // Error handled silently
    } finally {
      inFlightRef.current = false;
      if (!skipFinalize) {
        stopLoading();
        setIsDecrypting(false);
      }
    }
  }, [rfxId, decrypt, isCryptoLoading, isEncrypted]);

  // Keep a stable ref to the fetcher to avoid effect dependency loops
  const fetchRef = useRef(fetchProgressData);
  useEffect(() => { fetchRef.current = fetchProgressData; }, [fetchProgressData]);

  useEffect(() => {
    if (!rfxId) {
      setLoading(false);
      return;
    }

    fetchRef.current();

    // Subscribe to changes in rfx_evaluation_results
    const evaluationChannel = supabase
      .channel(`rfx_evaluation_results_${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_evaluation_results',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchRef.current();
        }
      )
      .subscribe();

    // Subscribe to changes in rfx_selected_candidates
    const selectedChannel = supabase
      .channel(`rfx_selected_candidates_${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_selected_candidates',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchRef.current();
        }
      )
      .subscribe();

    // Subscribe to changes in rfx_specs
    const specsChannel = supabase
      .channel(`rfx_specs_${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_specs',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchRef.current();
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(evaluationChannel);
      supabase.removeChannel(selectedChannel);
      supabase.removeChannel(specsChannel);
    };
  }, [rfxId]);

  // When crypto loading finishes (keys ready or determined unavailable), refresh progress
  useEffect(() => {
    if (!rfxId) return;
    // Wait for crypto to be ready (keys loaded or failed) instead of just checking isLoading
    if (!isReady) return;
    fetchRef.current();
  }, [rfxId, isReady]);

  // Update progress when validation data changes
  // Avoid redundant fetches when validation state signature hasn't changed
  const lastValidationSignatureRef = useRef<string>('');
  useEffect(() => {
    const signature = `${members?.length || 0}|${validations?.length || 0}|${allMembersValidated ? 1 : 0}`;
    const shouldUpdate = rfxId && (members?.length || 0) > 0 && signature !== lastValidationSignatureRef.current;
    if (!rfxId) return;
    if (!shouldUpdate) return;
    lastValidationSignatureRef.current = signature;
    fetchRef.current();
  }, [members, validations, allMembersValidated, rfxId]);

  const refreshProgress = useCallback(() => {
    fetchProgressData();
  }, [fetchProgressData]);

  return {
    progressData,
    loading,
    isDecrypting,
    refreshProgress
  };
};
