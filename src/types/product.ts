export interface Product {
  id: string;
  product_name: string;
  main_category: string;
  subcategories?: string[];
  short_description: string;
  long_description: string;
  key_features?: string[];
  use_cases?: string[];
  target_industries?: string[];
  definition_score?: number;
  image?: string[];
  source?: string;
  youtube_url?: string;
  pdf_url?: string;
  product_url?: string;
}

export interface ProductDocument {
  id: string;
  product_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  source: string;
  created_at: string;
  uploaded_by: string | null;
  product_revision_id: string | null;
  is_scraped?: boolean; // Flag to indicate if this PDF was automatically scraped
  external_url?: string; // For scraped PDFs, the external URL
}


