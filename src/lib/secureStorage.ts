/**
 * Secure storage utility with encryption for sensitive data
 */

// Simple encryption/decryption using Web Crypto API
class SecureStorage {
  private static instance: SecureStorage;
  private key: CryptoKey | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  /**
   * Initialize the secure storage with a key
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if Web Crypto API is available
      if (!crypto || !crypto.subtle) {
        console.warn('Web Crypto API not available, using unencrypted storage');
        this.initialized = true;
        return;
      }

      // Generate or retrieve a key for encryption
      const keyData = localStorage.getItem('fq-storage-key');
      if (keyData) {
        // Import existing key
        const keyBuffer = new Uint8Array(JSON.parse(keyData));
        this.key = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        this.key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        // Store the key
        const keyBuffer = await crypto.subtle.exportKey('raw', this.key);
        localStorage.setItem('fq-storage-key', JSON.stringify(Array.from(new Uint8Array(keyBuffer))));
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize secure storage:', error);
      // Fallback to unencrypted storage
      this.initialized = true;
    }
  }

  /**
   * Encrypt data
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.key) throw new Error('Storage not initialized');

    try {
      // Verify crypto API is still available
      if (!crypto || !crypto.subtle || !crypto.getRandomValues) {
        return data; // Fallback to unencrypted
      }

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.key,
        dataBuffer
      );
      
      const result = {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
      };
      
      return JSON.stringify(result);
    } catch (error) {
      console.error('Encryption failed:', error);
      return data; // Fallback to unencrypted
    }
  }

  /**
   * Decrypt data
   */
  private async decrypt(encryptedData: string): Promise<string> {
    if (!this.key) throw new Error('Storage not initialized');

    try {
      // Verify crypto API is still available
      if (!crypto || !crypto.subtle) {
        return encryptedData; // Fallback to treating as unencrypted
      }

      const { iv, data } = JSON.parse(encryptedData);
      const ivBuffer = new Uint8Array(iv);
      const dataBuffer = new Uint8Array(data);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        this.key,
        dataBuffer
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedData; // Fallback to treating as unencrypted
    }
  }

  /**
   * Set item in secure storage
   */
  async setItem(key: string, value: string, encrypt: boolean = true): Promise<void> {
    await this.init();
    
    try {
      const finalValue = encrypt && this.key ? await this.encrypt(value) : value;
      const metadata = { encrypted: encrypt && this.key !== null, timestamp: Date.now() };
      
      localStorage.setItem(key, JSON.stringify({ value: finalValue, metadata }));
    } catch (error) {
      console.error('Failed to set secure item:', error);
      localStorage.setItem(key, value); // Fallback
    }
  }

  /**
   * Get item from secure storage
   */
  async getItem(key: string): Promise<string | null> {
    await this.init();
    
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      try {
        const parsed = JSON.parse(stored);
        if (parsed.metadata && parsed.value !== undefined) {
          // New format with encryption
          const value = parsed.metadata.encrypted ? await this.decrypt(parsed.value) : parsed.value;
          
          // Check if data has expired (24 hours)
          const age = Date.now() - parsed.metadata.timestamp;
          if (age > 24 * 60 * 60 * 1000) {
            this.removeItem(key);
            return null;
          }
          
          return value;
        } else {
          // Legacy format or direct value
          return stored;
        }
      } catch (parseError) {
        // If parsing fails, treat as legacy unencrypted value
        return stored;
      }
    } catch (error) {
      console.error('Failed to get secure item:', error);
      return localStorage.getItem(key); // Fallback
    }
  }

  /**
   * Remove item from secure storage
   */
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  /**
   * Clear all secure storage
   */
  clear(): void {
    localStorage.clear();
  }

  /**
   * Check if an item exists
   */
  async hasItem(key: string): Promise<boolean> {
    const item = await this.getItem(key);
    return item !== null;
  }
}

// Export singleton instance
export const secureStorage = SecureStorage.getInstance();

// Utility functions for common operations
export const secureStorageUtils = {
  /**
   * Store user profile securely
   */
  async storeUserProfile(profile: any): Promise<void> {
    await secureStorage.setItem('fq-user-profile', JSON.stringify(profile), true);
  },

  /**
   * Get user profile
   */
  async getUserProfile(): Promise<any | null> {
    const stored = await secureStorage.getItem('fq-user-profile');
    return stored ? JSON.parse(stored) : null;
  },

  /**
   * Store conversation data
   */
  async storeConversation(conversationId: string, data: any): Promise<void> {
    await secureStorage.setItem(`fq-conversation-${conversationId}`, JSON.stringify(data), false);
  },

  /**
   * Get conversation data
   */
  async getConversation(conversationId: string): Promise<any | null> {
    const stored = await secureStorage.getItem(`fq-conversation-${conversationId}`);
    return stored ? JSON.parse(stored) : null;
  },

  /**
   * Store RFX projects
   */
  async storeRFXProjects(projects: any[]): Promise<void> {
    await secureStorage.setItem('fq-rfx-projects', JSON.stringify(projects), false);
  },

  /**
   * Get RFX projects
   */
  async getRFXProjects(): Promise<any[]> {
    const stored = await secureStorage.getItem('fq-rfx-projects');
    return stored ? JSON.parse(stored) : [];
  },

  /**
   * Store interface preferences
   */
  async storeInterfacePreferences(preferences: any): Promise<void> {
    await secureStorage.setItem('fq-interface-preferences', JSON.stringify(preferences), false);
  },

  /**
   * Get interface preferences
   */
  async getInterfacePreferences(): Promise<any | null> {
    const stored = await secureStorage.getItem('fq-interface-preferences');
    return stored ? JSON.parse(stored) : null;
  },

  /**
   * Clear all user data
   */
  async clearUserData(): Promise<void> {
    const keys = [
      'fq-user-profile', 
      'fq-company-name', 
      'fq-interface-preferences',
      'fq-rfx-projects',
      'current_conversation_id'
    ];
    keys.forEach(key => secureStorage.removeItem(key));
    
    // Also clear any conversation data
    const conversationKeys = Object.keys(localStorage).filter(key => key.startsWith('fq-conversation-'));
    conversationKeys.forEach(key => secureStorage.removeItem(key));
  }
};