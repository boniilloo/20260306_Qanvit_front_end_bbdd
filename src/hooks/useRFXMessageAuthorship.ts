import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MessageAuthor {
  user_id: string;
  user_name: string | null;
  user_surname: string | null;
  user_email: string | null;
  sent_at: string;
}

export function useRFXMessageAuthorship(
  rfxId: string,
  encryptFn?: (text: string) => Promise<string>,
  decryptFn?: (encryptedText: string) => Promise<string>
) {
  /**
   * Register a message as sent by the current user (content-based)
   * The message content is encrypted before saving to the database
   */
  const registerMessage = useCallback(async (messageContent: string, conversationId: string, sentAt?: Date) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔐 [Authorship] No user found, skipping registration');
        return;
      }

      console.log('🔐 [Authorship] Registering message:', {
        rfxId,
        conversationId,
        hasEncryptFn: !!encryptFn,
        messageLength: messageContent.length,
        messagePreview: messageContent.substring(0, 50)
      });

      // Encrypt the message content before saving
      let encryptedContent = messageContent;
      if (encryptFn) {
        try {
          console.log('🔐 [Authorship] Encrypting message content with RFX symmetric key...');
          encryptedContent = await encryptFn(messageContent);
          console.log('🔐 [Authorship] Message encrypted successfully:', {
            originalLength: messageContent.length,
            encryptedLength: encryptedContent.length,
            encryptedPreview: encryptedContent.substring(0, 100)
          });
        } catch (err) {
          console.error('❌ [Authorship] Error encrypting message content for authorship:', err);
          // If encryption fails, don't save (security: don't store plain text)
          return;
        }
      } else {
        console.warn('⚠️ [Authorship] No encryptFn provided, saving as plain text (not recommended for encrypted RFXs)');
      }

      const { error } = await supabase
        .from('rfx_message_authorship' as any)
        .insert({
          rfx_id: rfxId,
          conversation_id: conversationId,
          message_content: encryptedContent,
          user_id: user.id,
          sent_at: (sentAt || new Date()).toISOString()
        });

      if (error && error.code !== '23505') { // Ignore duplicate key errors
        console.error('❌ [Authorship] Error registering message authorship:', error);
      } else if (error && error.code === '23505') {
        console.log('ℹ️ [Authorship] Duplicate message authorship entry (already exists)');
      } else {
        console.log('✅ [Authorship] Message authorship registered successfully');
      }
    } catch (err) {
      console.error('❌ [Authorship] Error registering message authorship:', err);
    }
  }, [rfxId, encryptFn]);

  /**
   * Get author for a message by content and timestamp
   * The message content should already be encrypted (as stored in rfx_message_authorship)
   * If it's not encrypted, we'll encrypt it before searching
   */
  const getMessageAuthor = useCallback(async (messageContent: string, messageTimestamp: Date): Promise<MessageAuthor | null> => {
    try {
      console.log('🔍 [Authorship] Searching for message author:', {
        rfxId,
        hasEncryptFn: !!encryptFn,
        messageLength: messageContent.length,
        messagePreview: messageContent.substring(0, 50),
        timestamp: messageTimestamp.toISOString()
      });

      // Check if content is already encrypted (has JSON format with iv and data)
      let isAlreadyEncrypted = false;
      try {
        const parsed = JSON.parse(messageContent);
        if (parsed.iv && parsed.data) {
          isAlreadyEncrypted = true;
          console.log('✅ [Authorship] Content is already encrypted, using as-is for search');
        }
      } catch {
        // Not JSON, likely plain text
      }

      // Use content as-is if already encrypted, otherwise encrypt it
      let searchContent = messageContent;
      if (!isAlreadyEncrypted && encryptFn) {
        try {
          console.log('🔐 [Authorship] Content is plain text, encrypting for search with RFX symmetric key...');
          searchContent = await encryptFn(messageContent);
          console.log('🔐 [Authorship] Message encrypted for search:', {
            originalLength: messageContent.length,
            encryptedLength: searchContent.length,
            encryptedPreview: searchContent.substring(0, 100)
          });
        } catch (err) {
          console.error('❌ [Authorship] Error encrypting message content for search:', err);
          // If encryption fails, try searching with plain text (might be legacy data)
          console.warn('⚠️ [Authorship] Falling back to plain text search (legacy data?)');
          searchContent = messageContent;
        }
      } else if (!isAlreadyEncrypted) {
        console.warn('⚠️ [Authorship] No encryptFn provided and content is not encrypted, searching with plain text');
      }

      const { data, error } = await supabase
        .rpc('find_message_author', {
          p_rfx_id: rfxId,
          p_message_content: searchContent,
          p_message_timestamp: messageTimestamp.toISOString()
        });

      if (error) {
        // Silently handle access denied errors (expected for public RFXs)
        if (error.code === 'P0001' && error.message?.includes('Access denied')) {
          console.log('ℹ️ [Authorship] Access denied (expected for public RFXs)');
          return null;
        }
        // Only log other errors
        console.error('❌ [Authorship] Error fetching message author:', error);
        return null;
      }

      if (!data || data.length === 0) {
        console.log('ℹ️ [Authorship] No author found for message');
        return null;
      }

      console.log('✅ [Authorship] Author found:', {
        user_id: data[0].user_id,
        user_name: data[0].user_name,
        user_email: data[0].user_email
      });

      return data[0];
    } catch (err) {
      // Silently handle access denied errors (expected for public RFXs)
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P0001') {
        console.log('ℹ️ [Authorship] Access denied (expected for public RFXs)');
        return null;
      }
      console.error('❌ [Authorship] Error fetching message author:', err);
      return null;
    }
  }, [rfxId, encryptFn]);

  /**
   * Get authors for multiple messages (batched)
   * Loads all authorship records from rfx_message_authorship, decrypts them,
   * and matches them with chat messages by content and closest timestamp
   */
  const getMessageAuthors = useCallback(async (messages: Array<{ content: string; timestamp: Date }>): Promise<Map<string, MessageAuthor>> => {
    const authorsMap = new Map<string, MessageAuthor>();
    
    try {
      console.log('👥 [Authorship] Loading all authorship records for RFX:', {
        rfxId,
        messageCount: messages.length,
        hasDecryptFn: !!decryptFn
      });

      // Load all authorship records for this RFX
      const { data: authorshipRecords, error } = await supabase
        .from('rfx_message_authorship' as any)
        .select('id, message_content, user_id, sent_at')
        .eq('rfx_id', rfxId)
        .order('sent_at', { ascending: true });

      if (error) {
        console.error('❌ [Authorship] Error loading authorship records:', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          rfxId,
          hint: 'This might be an RLS (Row Level Security) issue. Check if user has access to this RFX.'
        });
        return authorsMap;
      }

      if (!authorshipRecords || authorshipRecords.length === 0) {
        console.log('ℹ️ [Authorship] No authorship records found for RFX:', {
          rfxId,
          hint: 'This could mean: 1) No messages have been registered yet, 2) RLS is blocking access, or 3) Records were deleted'
        });
        return authorsMap;
      }

      console.log('📋 [Authorship] Loaded authorship records:', {
        count: authorshipRecords.length
      });

      // Decrypt all authorship records
      const decryptedRecords = decryptFn
        ? await Promise.all(
            authorshipRecords.map(async (record) => {
              try {
                const decryptedContent = await decryptFn(record.message_content);
                return {
                  ...record,
                  decryptedContent,
                  sentAt: new Date(record.sent_at)
                };
              } catch (err) {
                console.error('❌ [Authorship] Error decrypting authorship record:', err);
                // If decryption fails, try using as plain text (legacy data)
                return {
                  ...record,
                  decryptedContent: record.message_content,
                  sentAt: new Date(record.sent_at)
                };
              }
            })
          )
        : authorshipRecords.map(record => ({
            ...record,
            decryptedContent: record.message_content,
            sentAt: new Date(record.sent_at)
          }));

      console.log('🔓 [Authorship] Decrypted authorship records:', {
        count: decryptedRecords.length,
        samples: decryptedRecords.slice(0, 3).map(r => ({
          decryptedPreview: r.decryptedContent.substring(0, 50),
          sentAt: r.sentAt.toISOString()
        }))
      });

      // Get user info for all unique user_ids
      const userIds = [...new Set(decryptedRecords.map(r => r.user_id))];
      console.log('👤 [Authorship] Fetching user info for user IDs:', {
        userIdCount: userIds.length,
        userIds: userIds
      });

      const { data: userData, error: userDataError } = await supabase
        .from('app_user' as any)
        .select('auth_user_id, name, surname')
        .in('auth_user_id', userIds);

      if (userDataError) {
        console.error('❌ [Authorship] Error fetching user data:', userDataError);
      }

      console.log('👤 [Authorship] User data fetched:', {
        foundUsers: userData?.length || 0,
        requestedUsers: userIds.length,
        users: userData?.map(u => ({
          auth_user_id: u.auth_user_id,
          name: u.name,
          surname: u.surname
        }))
      });

      const userInfoMap = new Map<string, { name: string | null; surname: string | null; email: string | null }>();
      
      userIds.forEach(userId => {
        const appUser = userData?.find(u => u.auth_user_id === userId);
        if (!appUser) {
          console.warn('⚠️ [Authorship] User not found in app_user table:', {
            userId,
            availableUsers: userData?.map(u => u.auth_user_id)
          });
        }
        userInfoMap.set(userId, {
          name: appUser?.name || null,
          surname: appUser?.surname || null,
          email: null // Email not available in client-side, can be fetched separately if needed
        });
      });

      // Match each chat message with the closest authorship record
      messages.forEach((chatMsg) => {
        // Normalize content for comparison (trim and normalize whitespace)
        const normalizeContent = (text: string) => text.trim().replace(/\s+/g, ' ');
        const chatContent = normalizeContent(chatMsg.content);
        const chatTimestamp = chatMsg.timestamp;

        // Find all records with matching content (normalized)
        const matchingRecords = decryptedRecords.filter(record => {
          const recordContent = normalizeContent(record.decryptedContent);
          const matches = recordContent === chatContent;
          if (!matches && recordContent.substring(0, 50) === chatContent.substring(0, 50)) {
            // Log near-matches for debugging
            console.log('🔍 [Authorship] Near-match found (content differs):', {
              chatContent: chatContent.substring(0, 100),
              recordContent: recordContent.substring(0, 100),
              chatLength: chatContent.length,
              recordLength: recordContent.length
            });
          }
          return matches;
        });

        if (matchingRecords.length === 0) {
          console.log('⚠️ [Authorship] No matching record found for message:', {
            contentPreview: chatContent.substring(0, 50),
            contentLength: chatContent.length,
            availableRecords: decryptedRecords.length,
            sampleRecords: decryptedRecords.slice(0, 3).map(r => ({
              preview: normalizeContent(r.decryptedContent).substring(0, 50),
              length: normalizeContent(r.decryptedContent).length
            }))
          });
          return;
        }

        // Find the record with the closest timestamp
        let bestMatch = matchingRecords[0];
        let minTimeDiff = Math.abs(bestMatch.sentAt.getTime() - chatTimestamp.getTime());

        matchingRecords.forEach(record => {
          const timeDiff = Math.abs(record.sentAt.getTime() - chatTimestamp.getTime());
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            bestMatch = record;
          }
        });

        // Get user info for the best match
        const userInfo = userInfoMap.get(bestMatch.user_id);
        if (!userInfo) {
          console.warn('⚠️ [Authorship] User info not found for matched record:', {
            userId: bestMatch.user_id,
            contentPreview: chatContent.substring(0, 50),
            availableUserIds: Array.from(userInfoMap.keys())
          });
          // Still create author entry with minimal info to avoid "Unknown User"
          const author: MessageAuthor = {
            user_id: bestMatch.user_id,
            user_name: null,
            user_surname: null,
            user_email: null,
            sent_at: bestMatch.sent_at
          };
          authorsMap.set(chatMsg.content, author);
          return;
        }

        const author: MessageAuthor = {
          user_id: bestMatch.user_id,
          user_name: userInfo.name,
          user_surname: userInfo.surname,
          user_email: userInfo.email,
          sent_at: bestMatch.sent_at
        };

        authorsMap.set(chatMsg.content, author);
        const authorName = `${userInfo.name || ''} ${userInfo.surname || ''}`.trim();
        console.log('✅ [Authorship] Matched message with author:', {
          contentPreview: chatContent.substring(0, 50),
          userId: bestMatch.user_id,
          authorName: authorName || 'No name available',
          hasName: !!userInfo.name,
          hasSurname: !!userInfo.surname,
          timeDiff: minTimeDiff
        });
      });

      console.log('✅ [Authorship] Authors map created:', {
        mapSize: authorsMap.size,
        totalMessages: messages.length
      });

    } catch (err) {
      console.error('❌ [Authorship] Error fetching message authors:', err);
    }

    return authorsMap;
  }, [rfxId, decryptFn]);

  /**
   * Format author name for display
   */
  const formatAuthorName = useCallback((author: MessageAuthor | undefined | null): string => {
    if (!author) {
      console.warn('⚠️ [Authorship] formatAuthorName called with null/undefined author');
      return 'Unknown User';
    }
    
    const name = author.user_name || '';
    const surname = author.user_surname || '';
    const fullName = `${name} ${surname}`.trim();
    
    if (fullName) {
      return fullName;
    }
    
    if (author.user_email) {
      return author.user_email;
    }
    
    // If no name or email, show user_id (truncated) as fallback
    if (author.user_id) {
      console.warn('⚠️ [Authorship] No name or email for user, using user_id:', {
        userId: author.user_id
      });
      return `User ${author.user_id.substring(0, 8)}...`;
    }
    
    return 'Unknown User';
  }, []);

  return {
    registerMessage,
    getMessageAuthor,
    getMessageAuthors,
    formatAuthorName
  };
}
