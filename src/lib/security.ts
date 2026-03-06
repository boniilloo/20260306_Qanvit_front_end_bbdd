/**
 * Security utilities for input validation and sanitization
 */

// Input validation schemas
export const ValidationRules = {
  // Email validation
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // Text input validation (prevent XSS)
  text: {
    maxLength: 1000,
    minLength: 1,
    pattern: /^[a-zA-Z0-9\s\-_.,!?()]+$/
  },
  
  // Company name validation
  companyName: {
    maxLength: 100,
    minLength: 2,
    pattern: /^[a-zA-Z0-9\s\-_.,&()]+$/
  },
  
  // URL validation
  url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/
};

/**
 * Sanitize text input to prevent XSS attacks
 */
export function sanitizeText(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove HTML tags and entities
  const sanitized = input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
  
  // Limit length
  return sanitized.slice(0, maxLength);
}

/**
 * Sanitize URL input without encoding forward slashes
 */
export function sanitizeUrl(input: string, maxLength: number = 2000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove HTML tags and entities but preserve forward slashes for URLs
  const sanitized = input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
  
  // Limit length
  return sanitized.slice(0, maxLength);
}

/**
 * Validate email address
 */
export function validateEmail(email: string): boolean {
  return ValidationRules.email.test(email);
}

/**
 * Validate text input
 */
export function validateText(text: string, options: { maxLength?: number; minLength?: number; required?: boolean } = {}): { isValid: boolean; error?: string } {
  const { maxLength = 1000, minLength = 1, required = true } = options;
  
  if (!text || typeof text !== 'string') {
    return { isValid: !required, error: required ? 'This field is required' : undefined };
  }
  
  if (text.length < minLength) {
    return { isValid: false, error: `Must be at least ${minLength} characters long` };
  }
  
  if (text.length > maxLength) {
    return { isValid: false, error: `Must be no more than ${maxLength} characters long` };
  }
  
  return { isValid: true };
}

/**
 * Validate company name
 */
export function validateCompanyName(name: string): { isValid: boolean; error?: string } {
  const validation = validateText(name, { maxLength: 100, minLength: 2 });
  
  if (!validation.isValid) {
    return validation;
  }
  
  if (!ValidationRules.companyName.pattern.test(name)) {
    return { isValid: false, error: 'Company name contains invalid characters' };
  }
  
  return { isValid: true };
}

/**
 * Validate URL
 */
export function validateUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }
  
  if (!ValidationRules.url.test(url)) {
    return { isValid: false, error: 'Please enter a valid URL' };
  }
  
  return { isValid: true };
}

/**
 * Enhanced LinkedIn URL validation
 */
export function validateLinkedInUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'LinkedIn profile URL is required' };
  }

  // More permissive LinkedIn URL pattern that handles:
  // - Encoded characters (like %C3%AD)
  // - Different URL formats
  // - Public profile IDs with numbers, letters, hyphens, underscores, and encoded chars
  const linkedinPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/;
  
  if (!linkedinPattern.test(url)) {
    return { 
      isValid: false, 
      error: 'Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/your-profile)' 
    };
  }

  return { isValid: true };
}

/**
 * Rate limiting utility
 */
export class RateLimiter {
  private static instances: Map<string, RateLimiter> = new Map();
  private requests: number[] = [];
  
  constructor(private maxRequests: number, private windowMs: number) {}
  
  static getInstance(key: string, maxRequests: number = 10, windowMs: number = 60000): RateLimiter {
    if (!RateLimiter.instances.has(key)) {
      RateLimiter.instances.set(key, new RateLimiter(maxRequests, windowMs));
    }
    return RateLimiter.instances.get(key)!;
  }
  
  isAllowed(): boolean {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if we're within the limit
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    this.requests.push(now);
    return true;
  }
}

/**
 * Content Security Policy headers
 */
export const CSP_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
};