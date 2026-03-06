/**
 * Small frontend-only email aliasing for display purposes.
 * This does NOT change anything in the database or auth provider.
 */
const EMAIL_ALIASES: Record<string, string> = {
  'aloriquel@gmail.com': 'contact@fqsource.com',
  '1t12davidbonillo@gmail.com': 'david.bonillo@fqsource.com',
};

export function applyEmailAliases(email?: string | null): string | null | undefined {
  if (!email) return email;
  const normalized = email.trim().toLowerCase();
  return EMAIL_ALIASES[normalized] ?? email;
}


