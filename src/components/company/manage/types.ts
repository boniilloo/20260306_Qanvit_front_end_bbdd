import type React from 'react';

export interface ManageCompanyTabProps {
  companyId: string;
  companyName: string;
  companySlug?: string;
}

export interface Product {
  id: string; // product.id
  product_name: string;
  main_category: string;
  short_description: string;
  is_active: boolean;
  created_at: string;
  revision_id: string; // The ID of the most relevant revision
}

export interface CompanyMember {
  id: string;
  name: string;
  surname: string;
  company_position: string;
  avatar_url?: string | null;
  auth_user_id: string;
  created_at: string;
  email: string;
}

export interface CompanyRevision {
  id: string;
  company_id: string;
  nombre_empresa: string;
  description: string;
  main_activities: string;
  strengths: string;
  sectors: string;
  website: string;
  youtube_url?: string;
  logo: string;
  is_active: boolean;
  created_at: string;
  source: string;
  comment: string;
  // Extra fields used in preview/overview rendering
  countries: any;
  cities: any;
  certifications: any;
  main_customers: any;
  contact_emails: any;
  contact_phones: any;
  gps_coordinates: any;
  revenues: any;
  created_by: string;
  creator_name?: string;
  creator_surname?: string;
}

export interface CompanyActivation {
  id: string;
  company_revision_id: string;
  activated_by: string;
  activated_at: string;
  revision_name: string;
  revision_created_at: string;
  revision_comment?: string;
  user_name: string;
  user_surname?: string;
}

export interface PendingAdminRequest {
  id: string;
  user_id: string;
  company_id: string;
  linkedin_url: string;
  comments: string | null;
  created_at: string;
  user_name?: string | null;
  user_surname?: string | null;
  user_email?: string;
}

export interface ProductRevision {
  id: string;
  product_id: string;
  product_name: string;
  main_category?: string;
  short_description?: string;
  long_description?: string;
  key_features?: string;
  use_cases?: string;
  target_industries?: string;
  is_active: boolean;
  created_at: string;
  source: string;
  definition_score?: string;
  comment?: string;
  created_by?: string;
  creator_name?: string;
  creator_surname?: string;
}

export interface ProductActivation {
  id: string;
  product_revision_id: string;
  action_by: string;
  action_at: string;
  action_type: string;
  revision_name: string;
  revision_created_at: string;
  revision_comment?: string;
  user_name: string;
  user_surname?: string;
}

