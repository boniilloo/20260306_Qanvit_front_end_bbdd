# Cybersecurity Audit - Control IAM-07

## Control Information

- **Control ID**: IAM-07
- **Control Name**: Segregation of Administrative Functions
- **Audit Date**: 2025-11-27
- **Client Question**: ¿Existe segregación entre administración técnica y funcional? (Is there segregation between technical and functional administration?)

---

## Executive Summary

⚠️ **PARTIALLY COMPLIANT**: The platform implements role-based separation between technical administration (Developer role) and functional administration (Platform Admin and Company Admin roles), with distinct permission scopes and access patterns. However, the Developer role has excessive privileges that allow it to manage functional administration roles, breaking the segregation principle. The Developer role can grant/revoke developer access, modify platform admin status, and manage company admin requests, effectively giving it "absolute power" without adequate controls.

1. **Role Separation Exists** - Three distinct administrative roles with different scopes: Developer (technical), Platform Admin (functional), and Company Admin (functional)
2. **Developer Over-Privilege** - Developers can manage all functional administration roles, violating segregation of duties
3. **Self-Management Risk** - Developers can grant/revoke developer access to themselves and others without external controls
4. **Audit Trail Present** - The `developer_access` table includes `granted_by` and `granted_at` fields for tracking, but lacks enforcement mechanisms
5. **Functional Admin Controls** - Platform Admin and Company Admin roles have appropriate scope limitations and cannot manage technical administration

---

## 1. Administrative Role Structure

The platform implements three distinct administrative role types with different scopes and purposes:

### 1.1. Technical Administration Role (Developer)

**Definition**: Technical/operational access for platform maintenance and debugging
- **Storage**: `developer_access` table (separate from `app_user`)
- **Scope**: Full platform access, including all data, management functions, and debugging tools
- **Purpose**: Technical operations, system maintenance, troubleshooting, and platform development

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE TABLE IF NOT EXISTS "public"."developer_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid"
);

CREATE OR REPLACE FUNCTION "public"."has_developer_access"("check_user_id" "uuid" DEFAULT "auth"."uid"()) 
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.developer_access 
    WHERE user_id = check_user_id
  );
$$;
```

### 1.2. Functional Administration Role (Platform Admin)

**Definition**: Platform-wide administrative access for business operations
- **Storage**: `app_user.is_admin` boolean field
- **Scope**: Platform-wide user and company management, approval workflows
- **Purpose**: Business administration, user management, company admin approvals

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE TABLE IF NOT EXISTS "public"."app_user" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "surname" "text",
    "company_id" "uuid",
    "is_admin" boolean DEFAULT false,
    -- ... other fields
);

CREATE OR REPLACE FUNCTION "public"."is_admin_user"("user_id" "uuid" DEFAULT "auth"."uid"()) 
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT COALESCE(is_admin, false) 
  FROM public.app_user 
  WHERE auth_user_id = user_id;
$$;
```

### 1.3. Functional Administration Role (Company Admin)

**Definition**: Company-specific administrative access
- **Storage**: `company_admin_requests` table with approval workflow
- **Scope**: Limited to specific company resources
- **Purpose**: Company-specific content management, product management, company data administration

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE TABLE IF NOT EXISTS "public"."company_admin_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "linkedin_url" "text" NOT NULL,
    "comments" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "rejection_reason" "text",
    "documents" "text"[],
    CONSTRAINT "company_admin_requests_status_check" 
      CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'revoked'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) 
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM company_admin_requests 
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status = 'approved'
  );
$$;
```

---

## 2. Segregation Analysis

### 2.1. Technical vs Functional Administration Separation

The platform **does implement separation** between technical and functional administration:

**Technical Administration (Developer)**:
- Manages platform infrastructure and technical operations
- Has access to debugging tools, system logs, and technical resources
- Can perform technical maintenance tasks

**Functional Administration (Platform Admin + Company Admin)**:
- Manages business content and user-facing operations
- Has access to user management, company management, and approval workflows
- Cannot access technical debugging tools or infrastructure management

**Evidence of Separation**:
```sql
-- Developers have technical-specific policies
CREATE POLICY "Developers can view all error reports" 
  ON "public"."error_reports" 
  FOR SELECT 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can manage embeddings" 
  ON "public"."embedding" 
  USING ("public"."has_developer_access"());

-- Company Admins have functional-specific policies
CREATE POLICY "Approved company admins can manage their company products" 
  ON "public"."product" 
  USING ((EXISTS ( 
    SELECT 1
    FROM "public"."company_admin_requests" "car"
    WHERE (("car"."company_id" = "product"."company_id") 
      AND ("car"."user_id" = "auth"."uid"()) 
      AND ("car"."status" = 'approved'::"text"))
  )));
```

### 2.2. Segregation Violation: Developer Over-Privilege

**Critical Finding**: Developers can manage functional administration roles, violating segregation of duties:

#### 2.2.1. Developer Can Manage Developer Access

Developers can grant/revoke developer access to themselves and others without external controls:

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can manage developer access" 
  ON "public"."developer_access" 
  USING ("public"."has_developer_access"());
```

**Impact**: 
- A developer can grant developer access to any user, including themselves (if they already have it, they can grant it to others)
- No approval workflow or external control exists
- The `granted_by` field provides audit trail but no enforcement

#### 2.2.2. Developer Can Manage Platform Admin Status

Developers can modify the `is_admin` field on any user, effectively controlling platform admin assignments:

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can update admin status and company assignments" 
  ON "public"."app_user" 
  FOR UPDATE 
  TO "authenticated" 
  USING ("public"."has_developer_access"()) 
  WITH CHECK ("public"."has_developer_access"());
```

**Impact**:
- Developers can grant platform admin privileges to any user
- Developers can revoke platform admin privileges from any user
- No approval workflow or segregation control exists

#### 2.2.3. Developer Can Manage Company Admin Requests

Developers can approve/reject/revoke company admin requests, controlling functional administration:

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can update admin requests" 
  ON "public"."company_admin_requests" 
  FOR UPDATE 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can view all admin requests" 
  ON "public"."company_admin_requests" 
  FOR SELECT 
  USING ("public"."has_developer_access"());
```

**Impact**:
- Developers can approve company admin requests without business justification
- Developers can revoke company admin privileges
- No separation between technical and functional approval processes

### 2.3. Functional Admin Limitations

**Positive Finding**: Functional administrators (Platform Admin and Company Admin) **cannot** manage technical administration:

**Platform Admin Limitations**:
- Cannot grant/revoke developer access (no policy exists for this)
- Cannot access technical debugging tools or system logs
- Limited to business operations and user management

**Company Admin Limitations**:
- Cannot grant/revoke developer access
- Cannot modify platform admin status
- Limited to their own company resources only

**Evidence**:
```sql
-- No policies exist that allow Platform Admin or Company Admin to manage developer_access
-- The only policy for developer_access is:
CREATE POLICY "Developers can manage developer access" 
  ON "public"."developer_access" 
  USING ("public"."has_developer_access"());

-- Regular users and admins cannot update is_admin field (only developers can)
CREATE POLICY "Users can update their own profile except admin status" 
  ON "public"."app_user" 
  FOR UPDATE 
  USING (("auth"."uid"() = "auth_user_id")) 
  WITH CHECK (("auth"."uid"() = "auth_user_id"));
```

---

## 3. Developer Role Privilege Analysis

### 3.1. Comprehensive Developer Access

Developers have access to **all platform resources** through 50+ RLS policies:

**Evidence of Broad Access**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can view all app users" 
  ON "public"."app_user" 
  FOR SELECT 
  TO "authenticated" 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can view all companies" 
  ON "public"."company" 
  FOR SELECT 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can view all RFXs" 
  ON "public"."rfxs" 
  FOR SELECT 
  USING ((EXISTS ( 
    SELECT 1 
    FROM "public"."developer_access" "d"
    WHERE ("d"."user_id" = "auth"."uid"())
  )));

CREATE POLICY "Developers can manage companies" 
  ON "public"."company" 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can manage products" 
  ON "public"."product" 
  USING ("public"."has_developer_access"());

-- ... 50+ additional policies granting developers full access
```

### 3.2. Developer Self-Management Capability

**Critical Risk**: Developers can manage their own access and the access of others:

1. **Self-Granting**: If a developer already has access, they can grant it to others (though not to themselves if they don't have it, due to RLS)
2. **Peer Management**: Developers can grant/revoke developer access to other users
3. **No Approval Required**: No external approval or oversight mechanism exists

**Evidence**:
```sql
-- Policy allows any developer to manage developer_access
CREATE POLICY "Developers can manage developer access" 
  ON "public"."developer_access" 
  USING ("public"."has_developer_access"());
```

**Note**: While RLS prevents a user from granting themselves developer access if they don't already have it (they wouldn't pass the `has_developer_access()` check), once they have developer access, they can grant it to others without restriction.

### 3.3. Audit Trail Mechanism

The platform includes audit trail fields for tracking developer access grants:

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE TABLE IF NOT EXISTS "public"."developer_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid",
    -- Foreign key to track who granted access
    CONSTRAINT "developer_access_granted_by_fkey" 
      FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id")
);
```

**Limitations**:
- Audit trail exists but is not automatically populated (requires application code to set `granted_by`)
- No enforcement mechanism prevents abuse
- No alerting or monitoring for suspicious access grants

---

## 4. Functional Administration Scope

### 4.1. Platform Admin Scope

Platform Admins have functional administrative capabilities limited to business operations:

**Capabilities**:
- View and manage user profiles
- Approve/reject company admin requests
- Manage company information
- Cannot access technical debugging tools
- Cannot manage developer access

**Evidence**:
```sql
-- Platform Admins can view and manage company admin requests
-- (Policy allows both developers and approved company admins)
CREATE POLICY "Approved company admins can view all requests for their company" 
  ON "public"."company_admin_requests" 
  FOR SELECT 
  USING (("public"."is_approved_company_admin"("company_id") OR "public"."has_developer_access"()));

-- Note: Platform Admins would use is_admin_user() function, but specific policies
-- for platform admin operations are not explicitly separated from developer policies
```

### 4.2. Company Admin Scope

Company Admins have the most restricted scope, limited to their own company:

**Capabilities**:
- Manage company products and documents
- Manage company revisions
- View company admin requests for their company
- Cannot access other companies' data
- Cannot manage developer access or platform admin status

**Evidence**:
```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Approved company admins can manage their company products" 
  ON "public"."product" 
  USING ((EXISTS ( 
    SELECT 1
    FROM "public"."company_admin_requests" "car"
    WHERE (("car"."company_id" = "product"."company_id") 
      AND ("car"."user_id" = "auth"."uid"()) 
      AND ("car"."status" = 'approved'::"text"))
  )));

CREATE POLICY "Company admins can manage their company documents" 
  ON "public"."company_documents" 
  USING ((EXISTS ( 
    SELECT 1
    FROM "public"."company_admin_requests" "car"
    WHERE (("car"."company_id" = "company_documents"."company_id") 
      AND ("car"."user_id" = "auth"."uid"()) 
      AND ("car"."status" = 'approved'::"text"))
  )));
```

---

## 5. Segregation Control Gaps

### 5.1. Missing Controls on Developer Access Management

**Gap**: No approval workflow or external control for developer access grants

**Current State**:
- Developers can grant/revoke developer access
- No requirement for multiple approvals
- No separation between grantor and grantee
- No time-limited or conditional access

**Recommendation**: Implement approval workflow requiring:
- Multiple developer approvals for new developer access
- Separation of grantor and grantee (developers cannot grant to themselves)
- External oversight or periodic review

### 5.2. Missing Controls on Platform Admin Management

**Gap**: Developers can unilaterally grant/revoke platform admin status

**Current State**:
- Developers can modify `is_admin` field on any user
- No approval workflow
- No business justification required
- No separation between technical and functional role management

**Recommendation**: Implement controls requiring:
- Business approval for platform admin grants
- Separation: Developers should not be able to grant platform admin without business approval
- Audit review of platform admin changes

### 5.3. Developer Access to Functional Administration

**Gap**: Developers can manage company admin requests without business context

**Current State**:
- Developers can approve/reject company admin requests
- No requirement for business justification
- Technical staff making functional business decisions

**Recommendation**: 
- Restrict company admin approvals to Platform Admins only
- Developers should only have view access for troubleshooting purposes
- Implement business approval workflow

---

## 6. Positive Segregation Aspects

### 6.1. Functional Admins Cannot Manage Technical Roles

✅ **Strength**: Platform Admins and Company Admins **cannot** grant developer access or manage technical administration:

**Evidence**:
- No RLS policies exist that allow non-developers to manage `developer_access` table
- Only the "Developers can manage developer access" policy exists
- Functional admins are properly restricted from technical operations

### 6.2. Company Admin Scope Limitation

✅ **Strength**: Company Admins are properly restricted to their own company:

**Evidence**:
- All Company Admin policies include company-specific checks
- Company Admins cannot access other companies' data
- Proper isolation between company resources

### 6.3. Role-Based Access Control Structure

✅ **Strength**: The platform uses a clear role hierarchy with distinct permission scopes:

```
Developer (Technical Administration)
  └── Full platform access
  └── Can manage all roles (segregation violation)
  └── Technical operations and debugging

Platform Admin (Functional Administration)
  └── Platform-wide business operations
  └── User and company management
  └── Cannot manage technical roles

Company Admin (Functional Administration)
  └── Company-specific operations
  └── Limited to own company
  └── Cannot manage technical roles
```

---

## 7. Conclusions

### 7.1. Strengths

✅ **Clear Role Separation Structure**: The platform implements distinct roles for technical (Developer) and functional (Platform Admin, Company Admin) administration with different scopes and purposes

✅ **Functional Admin Restrictions**: Platform Admins and Company Admins are properly restricted from managing technical administration roles and cannot grant developer access

✅ **Company-Level Isolation**: Company Admins are properly isolated to their own company resources, preventing cross-company access

✅ **Audit Trail Infrastructure**: The `developer_access` table includes `granted_by` and `granted_at` fields for tracking access grants, providing audit capability

✅ **Comprehensive RLS Implementation**: All administrative operations are controlled through Row Level Security policies, ensuring database-level enforcement

### 7.2. Recommendations

1. **Implement Developer Access Approval Workflow**: Require multiple developer approvals (e.g., 2-3 developers) for granting new developer access. Consider implementing a separate "super developer" role for initial bootstrap, or require external approval for the first developer access grants.

2. **Separate Platform Admin Management from Developers**: Remove developer ability to modify `is_admin` field. Create a separate approval workflow managed by business stakeholders or a separate "role administrator" role that cannot perform technical operations.

3. **Restrict Company Admin Approval to Platform Admins**: Remove developer ability to approve/reject company admin requests. Only Platform Admins should have this capability, as it is a functional business decision, not a technical operation.

4. **Implement Self-Granting Prevention**: Add RLS policy or application logic to prevent developers from granting developer access to themselves. Consider requiring `granted_by` to be different from `user_id`.

5. **Add Monitoring and Alerting**: Implement automated monitoring for developer access grants, platform admin changes, and company admin approvals. Alert on suspicious patterns such as rapid privilege escalations or self-granting attempts.

6. **Document Segregation Requirements**: Create formal documentation defining the separation between technical and functional administration, including which operations belong to each domain and the approval workflows required.

7. **Periodic Access Reviews**: Implement quarterly or annual reviews of developer access and platform admin assignments to ensure they remain appropriate and identify any segregation violations.

---

## 8. Control Compliance

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Separation between technical and functional administration roles | ⚠️ PARTIAL | Three distinct roles exist (Developer, Platform Admin, Company Admin) with different scopes, but Developers can manage functional administration roles |
| Functional administrators cannot manage technical roles | ✅ COMPLIANT | Platform Admins and Company Admins cannot grant developer access or manage technical administration |
| Technical administrators have limited scope | ❌ NON-COMPLIANT | Developers can manage all functional administration roles (Platform Admin, Company Admin) without restrictions |
| No single role with absolute power | ❌ NON-COMPLIANT | Developer role has "absolute power" - can grant/revoke developer access, modify platform admin status, and manage company admin requests |
| Approval workflows for role management | ❌ NON-COMPLIANT | No approval workflows exist for developer access grants or platform admin assignments |
| Audit trail for administrative actions | ⚠️ PARTIAL | Audit trail fields exist (`granted_by`, `granted_at`) but are not automatically populated and lack enforcement |

**FINAL VERDICT**: ⚠️ **PARTIALLY COMPLIANT** with control IAM-07. The platform implements role-based separation between technical and functional administration with distinct roles and permission scopes. However, the Developer role has excessive privileges that violate segregation of duties principles. Developers can manage all functional administration roles (Platform Admin and Company Admin) without external controls or approval workflows, effectively giving them "absolute power" over the platform. While functional administrators are properly restricted from managing technical roles, the reverse is not true. To achieve full compliance, the platform must implement controls preventing developers from managing functional administration roles and add approval workflows for all administrative role assignments.

---

## Appendices

### A. Developer Access Management Policy

The current policy allowing developers to manage developer access:

```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can manage developer access" 
  ON "public"."developer_access" 
  USING ("public"."has_developer_access"());
```

**Analysis**: 
- The `USING` clause applies to SELECT, UPDATE, and DELETE operations
- This means developers can view, modify, and delete developer access records
- INSERT operations would require a separate policy or would be denied by default RLS
- However, if INSERT is allowed through another mechanism, developers could grant access

### B. Platform Admin Management Policy

The policy allowing developers to modify platform admin status:

```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can update admin status and company assignments" 
  ON "public"."app_user" 
  FOR UPDATE 
  TO "authenticated" 
  USING ("public"."has_developer_access"()) 
  WITH CHECK ("public"."has_developer_access"());
```

**Analysis**:
- Developers can update the `is_admin` field on any user
- No restrictions on self-modification or peer modification
- No approval workflow or business justification required

### C. Company Admin Management Policies

Policies allowing developers to manage company admin requests:

```sql
-- supabase/migrations/20251121132118_remote_schema_baseline.sql
CREATE POLICY "Developers can update admin requests" 
  ON "public"."company_admin_requests" 
  FOR UPDATE 
  USING ("public"."has_developer_access"());

CREATE POLICY "Developers can view all admin requests" 
  ON "public"."company_admin_requests" 
  FOR SELECT 
  USING ("public"."has_developer_access"());
```

**Analysis**:
- Developers can approve, reject, or revoke company admin requests
- Developers can view all company admin requests across all companies
- No business approval required for functional administration decisions

### D. Role Permission Matrix

| Operation | Developer | Platform Admin | Company Admin |
|-----------|-----------|----------------|---------------|
| Grant Developer Access | ✅ Yes | ❌ No | ❌ No |
| Revoke Developer Access | ✅ Yes | ❌ No | ❌ No |
| Grant Platform Admin | ✅ Yes | ❌ No | ❌ No |
| Revoke Platform Admin | ✅ Yes | ❌ No | ❌ No |
| Approve Company Admin | ✅ Yes | ✅ Yes | ❌ No |
| Revoke Company Admin | ✅ Yes | ✅ Yes | ❌ No (own company only) |
| Manage Technical Resources | ✅ Yes | ❌ No | ❌ No |
| Manage Functional Resources | ✅ Yes | ✅ Yes | ✅ Yes (own company) |

**Segregation Violations** (marked in red):
- Developers can manage all functional administration roles
- No separation between technical and functional role management

### E. Recommended Segregation Model

**Ideal State**:

```
Technical Administration (Developer)
  └── Manage technical resources only
  └── Cannot grant/revoke functional admin roles
  └── Cannot approve business requests
  └── Limited to technical operations

Functional Administration (Platform Admin)
  └── Manage business operations
  └── Approve company admin requests
  └── Cannot manage developer access
  └── Cannot perform technical operations

Role Administrator (New Role - Recommended)
  └── Manage all role assignments
  └── Requires approval workflow
  └── Cannot perform technical or functional operations
  └── Separate from both technical and functional administration
```

**Implementation Approach**:
1. Create new `role_administrator` table or use existing Platform Admin with enhanced controls
2. Remove developer ability to modify `is_admin` and manage `company_admin_requests`
3. Implement approval workflow for all role assignments
4. Add monitoring and alerting for role changes

---

**End of Audit Report - Control IAM-07**





