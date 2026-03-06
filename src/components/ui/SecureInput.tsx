import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sanitizeText, sanitizeUrl, validateText, validateEmail, validateCompanyName, validateUrl, validateLinkedInUrl } from "@/lib/security";

interface SecureInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  validationType?: 'text' | 'email' | 'company' | 'url' | 'linkedin';
  maxLength?: number;
  minLength?: number;
  required?: boolean;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  sanitize?: boolean;
}

export const SecureInput = React.forwardRef<HTMLInputElement, SecureInputProps>(
  ({ 
    className, 
    validationType = 'text', 
    maxLength = 1000, 
    minLength = 1,
    required = true,
    onValidationChange,
    sanitize = true,
    onChange,
    onBlur,
    ...props 
  }, ref) => {
    const [error, setError] = React.useState<string | undefined>();
    const [isValid, setIsValid] = React.useState(true);

    const validateInput = React.useCallback((value: string) => {
      let validation: { isValid: boolean; error?: string };

      switch (validationType) {
        case 'email':
          validation = validateEmail(value) 
            ? { isValid: true } 
            : { isValid: false, error: 'Please enter a valid email address' };
          break;
        case 'company':
          validation = validateCompanyName(value);
          break;
        case 'url':
          validation = validateUrl(value);
          break;
        case 'linkedin':
          validation = validateLinkedInUrl(value);
          break;
        default:
          validation = validateText(value, { maxLength, minLength, required });
      }

      setError(validation.error);
      setIsValid(validation.isValid);
      onValidationChange?.(validation.isValid, validation.error);

      return validation.isValid;
    }, [validationType, maxLength, minLength, required, onValidationChange]);

    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;

      // Sanitize input if enabled
      if (sanitize) {
        // Use URL sanitization for URL and LinkedIn inputs to preserve forward slashes
        if (validationType === 'url' || validationType === 'linkedin') {
          value = sanitizeUrl(value, maxLength);
        } else {
          value = sanitizeText(value, maxLength);
        }
        e.target.value = value;
      }

      // Validate on change
      validateInput(value);

      onChange?.(e);
    }, [onChange, sanitize, maxLength, validationType, validateInput]);

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      // Validate on blur
      validateInput(e.target.value);
      onBlur?.(e);
    }, [onBlur, validateInput]);

    return (
      <div className="w-full">
        <Input
          ref={ref}
          className={cn(
            className,
            !isValid && "border-destructive focus-visible:ring-destructive"
          )}
          maxLength={maxLength}
          onChange={handleChange}
          onBlur={handleBlur}
          {...props}
        />
        {error && (
          <p className="text-sm text-destructive mt-1">{error}</p>
        )}
      </div>
    );
  }
);

SecureInput.displayName = "SecureInput";