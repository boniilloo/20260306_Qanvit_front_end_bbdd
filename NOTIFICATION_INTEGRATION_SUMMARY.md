# RFX Sending Notifications Integration - Summary

## Overview
Integrated email and in-app notifications for the RFX sending flow in the `/rfxs/sending` route. Now suppliers are properly notified when:
1. RFX requirements are updated (sent_commit_id changes)
2. New companies are invited to an existing RFX

## Changes Made

### 1. Database Migrations

#### Migration 1: `20251111200000_create_notifications_on_company_invitation.sql`
- **Purpose**: Automatically creates notifications when a company is invited to an RFX
- **Trigger**: `AFTER INSERT` on `rfx_company_invitations`
- **Notification Type**: `company_invited_to_rfx`
- **Scope**: Company-scoped (all users in the invited company)
- **Delivery Channel**: Both (in-app + email)
- **Message**: "Your company has been invited to participate in RFX {name}. Next step: your team must sign the NDA before accessing the RFX information."

#### Migration 2: `20251111201000_create_notifications_on_rfx_requirements_update.sql`
- **Purpose**: Automatically creates notifications when RFX requirements are updated
- **Trigger**: `AFTER UPDATE OF sent_commit_id` on `rfxs`
- **Notification Type**: `rfx_requirements_updated`
- **Scope**: Company-scoped (all invited companies)
- **Delivery Channel**: Both (in-app + email)
- **Conditions**: Only triggers if:
  - `sent_commit_id` actually changed
  - RFX status is NOT 'draft'
  - Company status is NOT 'declined' or 'cancelled'
- **Message**: "The buyer has adjusted the requirements for RFX {name}. Please review the updated specifications."

### 2. Frontend Changes: `src/pages/RFXSendingPage.tsx`

#### Scenario 1: Updating RFX Requirements (sent_commit_id update)
When the RFX status is NOT draft and the "Send to Suppliers" button is clicked:
- Updates `sent_commit_id` in the database
- **NEW**: After 500ms delay, invokes `send-notification-email` edge function with:
  - `type: 'rfx_requirements_updated'`
  - `targetType: 'rfx'`
  - `targetId: rfxId`
- This sends emails to all invited suppliers about the updated requirements
- DB trigger automatically creates in-app notifications

#### Scenario 2: Inviting New Companies
When new companies are added to the selected candidates list:
- Checks which companies are not yet invited
- Inserts new rows into `rfx_company_invitations`
- **NEW**: After 500ms delay, invokes TWO edge functions:
  1. `send-company-invitation-email`: Sends specific invitation emails to new companies
     - Contains RFX name and NDA signing instructions
  2. `send-notification-email`: Sends generic notification emails
     - `type: 'company_invited_to_rfx'`
     - `targetType: 'rfx'`
     - `targetId: rfxId`
- DB trigger automatically creates in-app notifications for new invitations

#### Toast Message Updates
- Updated toast messages to reflect new notifications being sent
- Shows different messages depending on whether new companies were invited or just requirements updated
- Example: "3 new supplier(s) invited. All suppliers have been notified about the specification updates."

## Edge Functions Used

### 1. `send-notification-email`
- Generic notification email sender
- Works with both notification IDs and filters (type, targetType, targetId)
- Uses service role key to bypass RLS
- Resolves recipients based on notification scope (user/company/global)
- Already deployed, no changes needed

### 2. `send-company-invitation-email`
- Specific invitation email for companies invited to an RFX
- Sends to all users in the invited companies
- Contains RFX-specific information and NDA signing instructions
- Already deployed, no changes needed

## Deployment Instructions

### 1. Apply Database Migrations
```bash
# Make sure you're in the project root
cd /home/david-bonillo/Documentos/FQ\ Source/20250617_Primera_version_web/FQ-V1-product

# Apply the migrations (they should be picked up automatically on next supabase push)
supabase db push
```

### 2. Verify Edge Functions (Optional)
The edge functions are already deployed and don't need changes. But if you want to verify:
```bash
# Check if functions are deployed
supabase functions list

# If needed, redeploy (remember to use --no-verify-jwt for send-notification-email)
supabase functions deploy send-notification-email --no-verify-jwt
supabase functions deploy send-company-invitation-email --no-verify-jwt
```

## Testing

### Test Scenario 1: RFX Requirements Update
1. Create an RFX and send it to suppliers (status should be 'waiting for supplier proposals' or similar)
2. Make changes to the RFX specifications
3. Go to `/rfxs/sending` route
4. Click "Send to Suppliers"
5. **Expected Results**:
   - All invited suppliers receive an in-app notification
   - All invited suppliers receive an email about requirements update
   - Toast message shows "Suppliers notified"

### Test Scenario 2: Inviting New Companies to Existing RFX
1. Create an RFX and send it to some suppliers
2. Add new candidates to the selected candidates list
3. Go to `/rfxs/sending` route
4. Click "Send to Suppliers"
5. **Expected Results**:
   - New companies receive invitation emails
   - New companies receive in-app notifications
   - Existing companies receive requirement update notifications (if sent_commit_id also changed)
   - Toast message shows "X new supplier(s) invited. All suppliers have been notified..."

### Test Scenario 3: No New Companies
1. Create an RFX and send it to suppliers
2. Make changes to specs but don't add new candidates
3. Go to `/rfxs/sending` route
4. Click "Send to Suppliers"
5. **Expected Results**:
   - All existing suppliers receive requirement update notifications
   - No invitation emails are sent
   - Toast message shows "All suppliers have been notified about the specification updates."

## Notification Types Added

### `company_invited_to_rfx`
- Created when: Company is invited to an RFX
- Scope: Company
- Recipients: All users in the invited company
- Target URL: `/rfxs`

### `rfx_requirements_updated`
- Created when: RFX requirements are updated (sent_commit_id changes)
- Scope: Company
- Recipients: All users in invited companies (except declined/cancelled)
- Target URL: `/rfxs/responses/{rfxId}`

## Notes

- All DB triggers use `SECURITY DEFINER` to bypass RLS and access all related data
- Emails are sent with a 500ms delay after DB operations to ensure triggers have executed
- Error handling is in place to not fail the main operation if notifications fail
- Console logs are added for debugging purposes
- The notification system follows the established patterns in `.cursor/rules/notifications.mdc`

## Colors Used (from workspace rules)
- #22183a (navy blue - dark)
- #f4a9aa (light blue)
- #f1f1f1 (gray)
- #7de19a (green)

These colors are used in email templates and match the FQ Source brand.












