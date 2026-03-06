export type PreambleMessage = string | { type: string; data: any };

// Estructura de imagen para mensajes multimodales
export interface MessageImage {
  data: string; // Base64 data URL
  filename: string;
  metadata: {
    size: number;
    format: string;
    width?: number;
    height?: number;
    description?: string;
    /** True when the binary is uploaded encrypted (E2E) and this object only contains a preview */
    encrypted?: boolean;
    /** Public URL of the encrypted blob in Storage (usually ends with `.enc`) */
    encryptedUrl?: string;
    /** Optional preview data URL used by UI (avoid storing this in DB) */
    preview?: string;
  };
}

// Estructura de documento para mensajes multimodales
export interface MessageDocument {
  url: string; // URL pública de Supabase Storage
  filename: string;
  metadata: {
    size: number;
    format: string;
    uploadedAt: string;
    /** True when the binary is uploaded encrypted (E2E) */
    encrypted?: boolean;
    /** Public URL of the encrypted blob in Storage (usually ends with `.enc`) */
    encryptedUrl?: string;
  };
}

// Contenido multimodal para mensajes
export interface MultimodalContent {
  text: string;
  images: MessageImage[];
  documents: MessageDocument[];
}

export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string | MultimodalContent;
  specifications?: string[];
  questions?: string[];
  suppliers?: {
    name: string;
    location: string;
    flag: string;
    capability: string;
    score: number;
  }[];
  attachments?: {
    file: File;
    url?: string;
  }[];
  // Imágenes para mensajes multimodales
  images?: MessageImage[];
  // Documentos para mensajes multimodales
  documents?: MessageDocument[];
  type?: string;
  data?: any;
  isStreaming?: boolean;
  preamble?: string;
  isPreambleStreaming?: boolean;
  preambleMessages?: PreambleMessage[];
  // UI hint: when true, the Reasoning accordion should auto-collapse
  collapseReasoning?: boolean;
  // Flag to indicate if message was loaded from database vs WebSocket
  fromDatabase?: boolean;
}

export interface EvaluationToolsPreambleData {
  text: string;
  products: string[];
  companies: string[];
}

export interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

export interface Propuesta {
  id_company_revision: string;
  id_product_revision: string;
  empresa: string;
  website?: string;
  producto: string;
  product_website?: string;
  match: number; // Technical match score
  company_match?: number; // Company match score
  company_match_justification?: string; // Justification for company match
  justification?: {
    sentence: string;
    pros: string[];
    cons: string[];
  }; // Legacy field for backward compatibility
  justification_sentence?: string; // New field for summary sentence
  justification_pros?: string[]; // New field for pros array
  justification_cons?: string[]; // New field for cons array
  country_hq?: string;
  // Removed: country_matches, experienced, startup (no longer used)
}

export interface PropuestasResponse {
  propuestas: Propuesta[];
}

export interface CategorizedRecommendations {
  best_matches: Propuesta[];
  // Removed: country_matches, experienced, startup (no longer used)
}

export interface Supplier {
  name: string;
  country: string;
  core_capability: string;
  fit_score: number;
  lead_time: string;
}

export interface SupplierResponse {
  suppliers: Supplier[];
}

// Tipos para mensajes WebSocket multimodales
export interface MultimodalWebSocketMessage {
  type: 'multimodal_message';
  content: MultimodalContent;
  metadata: {
    timestamp: string;
    user_id?: string;
  };
}
