/**
 * UUID utility with fallback for environments where crypto.randomUUID is not available
 */

/**
 * Generate a UUID v4 compatible string
 * Uses crypto.randomUUID if available, otherwise falls back to a custom implementation
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('crypto.randomUUID failed, using fallback:', error);
      // Fall through to fallback
    }
  }

  // Fallback implementation (RFC 4122 version 4)
  // Generate random bytes
  const getRandomBytes = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    // Use crypto.getRandomValues if available, otherwise Math.random
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback to Math.random (less secure but works everywhere)
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  };

  // Generate 16 random bytes (128 bits) for UUID v4
  const bytes = getRandomBytes(16);
  
  // Set version (4) and variant bits according to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant bits

  // Convert to UUID string format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

