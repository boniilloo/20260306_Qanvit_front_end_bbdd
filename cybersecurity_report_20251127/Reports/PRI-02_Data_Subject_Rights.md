# Cybersecurity Audit - Control PRI-02

## Control Information

- **Control ID**: PRI-02
- **Control Name**: Data Subject Rights
- **Audit Date**: 2025-11-27
- **Client Question**: "How do you manage requests for access, rectification, or erasure of data?"

---

## Executive Summary

⚠️ **PARTIALLY COMPLIANT**: The platform implements data subject rights through multiple mechanisms, with strong infrastructure for data rectification and erasure, but lacks explicit user-facing channels and processes for GDPR requests. While users can access and modify their personal data through the profile interface, there is no dedicated data export functionality, no user-facing account deletion feature, and no explicitly documented process for handling GDPR data subject requests.

1. **Data Access** - Users can view their personal data through the profile interface, but no data export functionality exists
2. **Data Rectification** - Well-implemented through the User Profile page with support for updating name, surname, email, position, and avatar
3. **Data Erasure** - Comprehensive CASCADE DELETE infrastructure exists (50+ tables) but requires administrative action via Supabase Admin API
4. **Contact Channels** - Multiple contact channels exist (email, feedback form, privacy policy) but are not specifically designated for GDPR requests
5. **Request Handling Process** - No documented or automated process for handling GDPR data subject requests

---

## 1. Right to Access (Article 15 GDPR)

### 1.1. User Data Visibility

Users can access their personal data through the **User Profile** page (`/user-profile`), which displays:

- **Profile Information**: Name, surname, email, company position, avatar
- **Statistics**: Number of RFXs created, saved suppliers, conversations
- **Company Association**: Current company affiliation

**Evidence**:
```typescript
// src/pages/UserProfile.tsx
const UserProfile = () => {
  // ... code ...
  
  // Load RFXs count
  const { count: rfxsCountResult } = await supabase
    .from('rfxs' as any)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  setRfxsCount(rfxsCountResult || 0);

  // Load saved suppliers count
  const { count } = await supabase
    .from('saved_companies')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  setSavedSuppliersCount(count || 0);

  // Load conversations count
  const { count: conversationsCount } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  setConversationsCount(conversationsCount || 0);
  
  // ... code ...
};
```

### 1.2. Data Export Functionality

**Status**: ❌ **NOT IMPLEMENTED**

The platform does not provide a data export functionality that allows users to download their personal data in a structured, machine-readable format (e.g., JSON, CSV). Users can view their data through the UI but cannot export it for portability purposes.

**Gap**: No "Export My Data" feature exists in the user interface.

---

## 2. Right to Rectification (Article 16 GDPR)

### 2.1. Profile Data Modification

The platform implements comprehensive data rectification through the **User Profile** page, allowing users to update:

- **Name and Surname**: Direct text input fields
- **Email Address**: Update with verification requirement
- **Company Position**: Free-text field
- **Company Association**: Searchable company selection
- **Avatar**: Upload, change, or remove profile picture

**Evidence**:
```typescript
// src/pages/UserProfile.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;
  
  // Check if email has changed
  const emailChanged = user?.email !== formData.email.trim();

  // Update email in Supabase Auth if it changed
  if (emailChanged) {
    const { error: authError } = await supabase.auth.updateUser({
      email: formData.email.trim()
    });
    if (authError) {
      throw new Error(`Failed to update email in authentication: ${authError.message}`);
    }
    
    toast({
      title: "Email update initiated",
      description: "Please check your new email address to confirm the change."
    });
  }

  // Update profile data in app_user table
  const { error } = await supabase
    .from('app_user')
    .update({
      name: formData.name.trim() || null,
      surname: formData.surname.trim() || null,
      company_position: formData.company_position.trim() || null,
      company_id: selectedCompany?.company_id || null
    })
    .eq('auth_user_id', user.id);
    
  if (error) throw error;
  
  toast({
    title: "Profile updated",
    description: "Your profile has been updated successfully."
  });
};
```

### 2.2. Email Verification Process

When users update their email address, the platform requires email verification through Supabase Auth, ensuring data integrity and preventing unauthorized email changes.

**Evidence**:
```typescript
// src/pages/UserProfile.tsx
// Update email in Supabase Auth if it changed
if (emailChanged) {
  const { error: authError } = await supabase.auth.updateUser({
    email: formData.email.trim()
  });
  
  // Show notification about email verification
  toast({
    title: "Email update initiated",
    description: "Please check your new email address to confirm the change. Your profile has been updated."
  });
}
```

### 2.3. Avatar Management

Users can upload, change, or delete their profile avatar through dedicated functions.

**Evidence**:
```typescript
// src/hooks/useAvatarUpload.ts
const deleteAvatar = async (avatarUrl: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Extract filename from URL
    const url = new URL(avatarUrl);
    const pathParts = url.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const filePath = `${user.id}/${fileName}`;

    // Delete file from storage
    const { error } = await supabase.storage
      .from('avatars')
      .remove([filePath]);

    if (error) throw error;

    // Update user profile to remove avatar URL
    const { error: updateError } = await supabase
      .from('app_user')
      .update({ avatar_url: null })
      .eq('auth_user_id', user.id);

    if (updateError) throw updateError;

    return true;
  } catch (error) {
    console.error('Error deleting avatar:', error);
    return false;
  }
};
```

**Status**: ✅ **COMPLIANT** - Data rectification is well-implemented with comprehensive user controls.

---

## 3. Right to Erasure (Article 17 GDPR)

### 3.1. Cascade Delete Infrastructure

The platform implements comprehensive **CASCADE DELETE** constraints on 50+ tables that reference user IDs, ensuring automatic cleanup of all related data when a user is deleted from `auth.users`.

**Tables with CASCADE DELETE on user references**:
- `developer_access` (user_id, granted_by)
- `company_admin_requests` (user_id)
- `rfx_members` (user_id)
- `rfx_invitations` (invited_by, target_user_id)
- `rfx_key_members` (user_id)
- `rfx_validations` (user_id)
- `rfxs` (user_id - owner)
- `conversations` (user_id)
- `error_reports` (user_id, resolved_by)
- `app_user` (auth_user_id)
- And 40+ additional tables

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
ALTER TABLE "public"."developer_access"
    ADD CONSTRAINT "developer_access_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."company_admin_requests"
    ADD CONSTRAINT "company_admin_requests_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."rfx_members"
    ADD CONSTRAINT "rfx_members_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."rfx_key_members"
    ADD CONSTRAINT "rfx_key_members_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."rfxs"
    ADD CONSTRAINT "rfxs_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
```

### 3.2. User-Facing Account Deletion

**Status**: ❌ **NOT IMPLEMENTED**

The platform does not provide a user-facing account deletion feature. Account deletion requires administrative action through:

- **Supabase Admin API**: Direct deletion from `auth.users` table
- **Supabase Dashboard**: Manual deletion through the management interface

**Gap**: No "Delete My Account" button or functionality exists in the user interface. Users cannot self-service account deletion requests.

**Impact**: Users must contact support to request account deletion, which may not meet GDPR requirements for timely response (30 days).

### 3.3. Cryptographic Key Cleanup

When users are deleted, their cryptographic keys are automatically cleaned up through CASCADE DELETE constraints:

- **User Private Keys**: Deleted from `app_user.encrypted_private_key`
- **RFX Keys**: Deleted from `rfx_key_members` when user is removed
- **Public Keys**: Deleted from `app_user.public_key`

**Evidence**:
```sql
-- supabase/migrations/20251121193506_add_rfx_key_members.sql
CREATE TABLE "public"."rfx_key_members" (
    "rfx_id" "uuid" NOT NULL REFERENCES "public"."rfxs"("id") ON DELETE CASCADE,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "encrypted_symmetric_key" "text" NOT NULL,
    "created_at" "timestamp with time zone" DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("rfx_id", "user_id")
);
```

**Status**: ⚠️ **PARTIALLY COMPLIANT** - Infrastructure exists but requires administrative action.

---

## 4. Contact Channels for Data Subject Requests

### 4.1. Available Contact Methods

The platform provides multiple contact channels, though none are explicitly designated for GDPR requests:

1. **Privacy Policy Link**: `https://fqsource.com/privacy` (displayed in footer)
2. **Contact Email**: `contact@fqsource.com` (displayed in maintenance page)
3. **Feedback Form**: `/feedback` page for general feedback
4. **Book a Meeting**: `https://fqsource.com/book-demo` (displayed in footer)

**Evidence**:
```typescript
// src/components/rfx/RFXFooter.tsx
<a
  href="https://fqsource.com/privacy"
  target="_blank"
  rel="noopener noreferrer"
  className="text-sm text-gray-600 hover:text-[#22183a] transition-colors"
>
  Privacy Policy
</a>

// src/components/MaintenancePage.tsx
<a 
  href="mailto:contact@fqsource.com" 
  className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
>
  contact@fqsource.com
</a>
```

### 4.2. Feedback Form

The platform includes a feedback form that could be used for GDPR requests, but it is not specifically labeled or categorized for data subject rights requests.

**Evidence**:
```typescript
// src/pages/Feedback.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!feedback.trim()) {
    toast({
      title: "Please enter your feedback",
      variant: "destructive"
    });
    return;
  }
  
  const { error } = await supabase
    .from('user_feedback')
    .insert([{
      feedback_text: feedback.trim(),
      category: category || null,
      user_id: (await supabase.auth.getUser()).data.user?.id
    }]);
    
  // Categories available:
  // - general
  // - feature-request
  // - bug-report
  // - user-experience
  // - performance
  // - other
};
```

**Gap**: No specific category or dedicated form for GDPR data subject requests.

**Status**: ⚠️ **PARTIALLY COMPLIANT** - Contact channels exist but are not explicitly designated for GDPR requests.

---

## 5. Request Handling Process

### 5.1. Documented Process

**Status**: ❌ **NOT IMPLEMENTED**

The platform does not have a documented or automated process for handling GDPR data subject requests. There is no:

- **Request Tracking System**: No dedicated table or workflow for tracking data subject requests
- **Response Time SLA**: No defined timeline for responding to requests (GDPR requires 30 days)
- **Request Verification**: No process for verifying the identity of requesters
- **Request Fulfillment Workflow**: No automated or documented steps for fulfilling requests

### 5.2. Request Types Not Explicitly Supported

The platform lacks explicit support for:

1. **Access Requests**: No automated data export functionality
2. **Rectification Requests**: Handled manually through profile updates (user-initiated)
3. **Erasure Requests**: Requires manual administrative action
4. **Portability Requests**: No data export in machine-readable format
5. **Objection Requests**: No process for handling processing objections
6. **Restriction Requests**: No mechanism to restrict processing

**Status**: ❌ **NON-COMPLIANT** - No documented or automated process exists.

---

## 6. Data Subject Rights in Privacy Policy

### 6.1. Privacy Policy Availability

The platform provides a link to the privacy policy (`https://fqsource.com/privacy`) in the footer, which should contain information about data subject rights.

**Evidence**:
```typescript
// src/components/rfx/RFXFooter.tsx
<a
  href="https://fqsource.com/privacy"
  target="_blank"
  rel="noopener noreferrer"
  className="text-sm text-gray-600 hover:text-[#22183a] transition-colors"
>
  Privacy Policy
</a>
```

**Note**: The actual content of the privacy policy is hosted externally and not part of this codebase audit. The privacy policy should contain:
- Information about data subject rights
- Contact information for exercising rights
- Response timeframes
- Process for submitting requests

**Status**: ✅ **COMPLIANT** - Privacy policy link is accessible, though content is external.

---

## 7. Conclusions

### 7.1. Strengths

✅ **Comprehensive Data Rectification**: The platform provides excellent user-facing controls for updating personal data through the User Profile page, including name, email, position, company association, and avatar management.

✅ **Robust Cascade Delete Infrastructure**: The platform implements CASCADE DELETE constraints on 50+ tables, ensuring complete data cleanup when users are deleted. This provides a solid foundation for data erasure.

✅ **Email Verification for Changes**: When users update their email address, the platform requires verification, ensuring data integrity and preventing unauthorized changes.

✅ **Privacy Policy Accessibility**: The privacy policy is easily accessible through the footer, providing users with information about data handling.

✅ **Multiple Contact Channels**: The platform provides several ways for users to contact support (email, feedback form, booking system), though not specifically designated for GDPR requests.

### 7.2. Recommendations

1. **Implement User-Facing Account Deletion**: Create a "Delete My Account" feature in the User Profile or Settings page that allows users to request account deletion. This should trigger a workflow that:
   - Verifies user identity
   - Provides a confirmation period (e.g., 7 days)
   - Executes account deletion through Supabase Admin API
   - Sends confirmation email

2. **Add Data Export Functionality**: Implement a "Export My Data" feature that allows users to download their personal data in a structured format (JSON or CSV). This should include:
   - Profile information
   - RFX data
   - Conversations
   - Saved suppliers
   - All other user-related data

3. **Create Dedicated GDPR Request Channel**: Add a dedicated section in the User Profile or Settings page specifically for GDPR data subject requests, with:
   - Clear categories (Access, Rectification, Erasure, Portability, Objection, Restriction)
   - Request submission form
   - Request status tracking
   - Response timeline display

4. **Implement Request Tracking System**: Create a database table and workflow system to track GDPR requests:
   - `data_subject_requests` table with fields: user_id, request_type, status, submitted_at, responded_at, fulfilled_at
   - Admin interface for processing requests
   - Automated email notifications for request status updates
   - SLA tracking (30-day response requirement)

5. **Document Request Handling Process**: Create internal documentation that defines:
   - Steps for processing each type of request
   - Identity verification procedures
   - Response timeframes
   - Escalation procedures
   - Data export formats and procedures

6. **Add Request Categories to Feedback Form**: Extend the feedback form to include GDPR-specific categories or create a separate form for data subject requests.

7. **Create Edge Function for Account Deletion**: Implement a secure Edge Function that handles user account deletion requests, including:
   - Identity verification
   - Confirmation period
   - Cascade deletion execution
   - Audit logging

8. **Enhance Privacy Policy Integration**: Ensure the privacy policy explicitly mentions:
   - All data subject rights
   - How to exercise each right
   - Contact information for requests
   - Expected response timeframes
   - Data export formats available

---

## 8. Control Compliance

| Criterion | Status | Evidence |
|-----|-----|----|
| Right to Access - Data Visibility | ✅ COMPLIANT | Users can view their personal data through User Profile page |
| Right to Access - Data Export | ❌ NON-COMPLIANT | No data export functionality exists |
| Right to Rectification | ✅ COMPLIANT | Comprehensive profile update functionality with email verification |
| Right to Erasure - Infrastructure | ✅ COMPLIANT | CASCADE DELETE constraints on 50+ tables |
| Right to Erasure - User-Facing | ❌ NON-COMPLIANT | No user-facing account deletion feature |
| Contact Channel - Availability | ✅ COMPLIANT | Multiple contact channels exist (email, feedback, privacy policy) |
| Contact Channel - GDPR-Specific | ⚠️ PARTIAL | Contact channels not explicitly designated for GDPR requests |
| Request Handling Process | ❌ NON-COMPLIANT | No documented or automated process for handling GDPR requests |
| Privacy Policy Accessibility | ✅ COMPLIANT | Privacy policy link accessible in footer |

**FINAL VERDICT**: ⚠️ **PARTIALLY COMPLIANT** with control PRI-02. The platform has strong infrastructure for data rectification and erasure (through CASCADE DELETE), and users can access and modify their data through the profile interface. However, the platform lacks explicit user-facing channels for GDPR requests, no data export functionality, no user-facing account deletion, and no documented process for handling data subject requests. To achieve full compliance, the platform should implement dedicated GDPR request channels, data export functionality, user-facing account deletion, and a documented request handling process with tracking and SLA management.

---

## Appendices

### A. Tables with CASCADE DELETE on User References

The following tables automatically clean up when a user is deleted from `auth.users`:

**Authentication & Access**:
- `developer_access` (user_id, granted_by)
- `company_admin_requests` (user_id)
- `terms_acceptance` (user_id)

**RFX Participation**:
- `rfx_members` (user_id)
- `rfx_invitations` (invited_by, target_user_id)
- `rfx_key_members` (user_id)
- `rfx_validations` (user_id)
- `rfx_announcements` (user_id)
- `rfx_developer_reviews` (user_id)
- `rfx_evaluation_results` (user_id)
- `rfx_message_authorship` (user_id)
- `rfx_selected_candidates` (user_id)
- `rfx_signed_nda_uploads` (uploaded_by)
- `rfx_specs_commits` (user_id)

**Resource Ownership**:
- `rfxs` (user_id - owner)
- `conversations` (user_id)
- `error_reports` (user_id, resolved_by)
- `public_rfxs` (made_public_by)

**Company Data**:
- `company_requests` (user_id)
- `company_revision_activations` (activated_by)

**User Data**:
- `app_user` (auth_user_id)
- `saved_companies` (user_id)
- `user_feedback` (user_id)

**And 30+ additional tables** with CASCADE DELETE constraints ensuring complete data cleanup.

### B. User Profile Data Fields

The following user data fields can be accessed and modified through the User Profile page:

**Editable Fields**:
- `name` (First Name)
- `surname` (Last Name)
- `email` (Email Address - requires verification)
- `company_position` (Position)
- `company_id` (Company Association)
- `avatar_url` (Profile Picture)

**Read-Only Statistics**:
- RFXs Created Count
- Saved Suppliers Count
- Conversations Count

**End of Audit Report - Control PRI-02**



