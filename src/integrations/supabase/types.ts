export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_memory_json: {
        Row: {
          conversation_id: string
          memory: Json
          updated_at: string
        }
        Insert: {
          conversation_id: string
          memory: Json
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          memory?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_json_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_backups: {
        Row: {
          ai_company_completion_language: string | null
          ai_company_completion_max_tokens: number | null
          ai_company_completion_model: string | null
          ai_company_completion_reasoning_effort: string | null
          ai_company_completion_system_prompt: string | null
          ai_company_completion_user_prompt: string | null
          ai_company_completion_verbosity: string | null
          ai_product_completion_language: string | null
          ai_product_completion_max_tokens: number | null
          ai_product_completion_model: string | null
          ai_product_completion_reasoning_effort: string | null
          ai_product_completion_system_prompt: string | null
          ai_product_completion_user_prompt: string | null
          ai_product_completion_verbosity: string | null
          comment: string | null
          created_at: string
          created_by: string
          embedding_model: number | null
          evaluate_product_prompt: string | null
          general_frequency_penalty: number | null
          general_model: string | null
          general_streaming: boolean | null
          general_temperature: number | null
          general_top_p: number | null
          get_evaluations_frequency_penalty: number | null
          get_evaluations_model: string | null
          get_evaluations_response_format: string | null
          get_evaluations_temperature: number | null
          get_evaluations_top_p: number | null
          id: string
          is_active: boolean | null
          lookup_frequency_penalty: number | null
          lookup_model: string | null
          lookup_prompt: string | null
          lookup_streaming: boolean | null
          lookup_temperature: number | null
          lookup_top_p: number | null
          recommendation_frequency_penalty: number | null
          recommendation_model: string | null
          recommendation_prompt: string | null
          recommendation_streaming: boolean | null
          recommendation_temperature: number | null
          recommendation_top_p: number | null
          router_frequency_penalty: number | null
          router_model: string | null
          router_prompt: string | null
          router_streaming: boolean | null
          router_temperature: number | null
          router_top_p: number | null
          system_prompt: string | null
        }
        Insert: {
          ai_company_completion_language?: string | null
          ai_company_completion_max_tokens?: number | null
          ai_company_completion_model?: string | null
          ai_company_completion_reasoning_effort?: string | null
          ai_company_completion_system_prompt?: string | null
          ai_company_completion_user_prompt?: string | null
          ai_company_completion_verbosity?: string | null
          ai_product_completion_language?: string | null
          ai_product_completion_max_tokens?: number | null
          ai_product_completion_model?: string | null
          ai_product_completion_reasoning_effort?: string | null
          ai_product_completion_system_prompt?: string | null
          ai_product_completion_user_prompt?: string | null
          ai_product_completion_verbosity?: string | null
          comment?: string | null
          created_at?: string
          created_by: string
          embedding_model?: number | null
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: string
          is_active?: boolean | null
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Update: {
          ai_company_completion_language?: string | null
          ai_company_completion_max_tokens?: number | null
          ai_company_completion_model?: string | null
          ai_company_completion_reasoning_effort?: string | null
          ai_company_completion_system_prompt?: string | null
          ai_company_completion_user_prompt?: string | null
          ai_company_completion_verbosity?: string | null
          ai_product_completion_language?: string | null
          ai_product_completion_max_tokens?: number | null
          ai_product_completion_model?: string | null
          ai_product_completion_reasoning_effort?: string | null
          ai_product_completion_system_prompt?: string | null
          ai_product_completion_user_prompt?: string | null
          ai_product_completion_verbosity?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string
          embedding_model?: number | null
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: string
          is_active?: boolean | null
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      agent_prompt_backups_v2: {
        Row: {
          ai_company_completion_language: string | null
          ai_company_completion_max_tokens: number | null
          ai_company_completion_model: string | null
          ai_company_completion_reasoning_effort: string | null
          ai_company_completion_system_prompt: string | null
          ai_company_completion_user_prompt: string | null
          ai_company_completion_verbosity: string | null
          ai_product_completion_language: string | null
          ai_product_completion_max_tokens: number | null
          ai_product_completion_model: string | null
          ai_product_completion_reasoning_effort: string | null
          ai_product_completion_system_prompt: string | null
          ai_product_completion_user_prompt: string | null
          ai_product_completion_verbosity: string | null
          comment: string | null
          created_at: string
          created_by: string
          embedding_model: number | null
          evaluations_system_prompt: string | null
          evaluations_user_prompt: string | null
          general_model: string | null
          general_reasoning_effort: string | null
          general_verbosity: string | null
          get_evaluations_model: string | null
          get_evaluations_reasoning_effort: string | null
          get_evaluations_verbosity: string | null
          id: string
          is_active: boolean | null
          lookup_model: string | null
          lookup_prompt: string | null
          lookup_reasoning_effort: string | null
          lookup_verbosity: string | null
          recommendation_model: string | null
          recommendation_prompt: string | null
          recommendation_reasoning_effort: string | null
          recommendation_verbosity: string | null
          router_model: string | null
          router_prompt: string | null
          router_reasoning_effort: string | null
          router_verbosity: string | null
          system_prompt: string | null
        }
        Insert: {
          ai_company_completion_language?: string | null
          ai_company_completion_max_tokens?: number | null
          ai_company_completion_model?: string | null
          ai_company_completion_reasoning_effort?: string | null
          ai_company_completion_system_prompt?: string | null
          ai_company_completion_user_prompt?: string | null
          ai_company_completion_verbosity?: string | null
          ai_product_completion_language?: string | null
          ai_product_completion_max_tokens?: number | null
          ai_product_completion_model?: string | null
          ai_product_completion_reasoning_effort?: string | null
          ai_product_completion_system_prompt?: string | null
          ai_product_completion_user_prompt?: string | null
          ai_product_completion_verbosity?: string | null
          comment?: string | null
          created_at?: string
          created_by: string
          embedding_model?: number | null
          evaluations_system_prompt?: string | null
          evaluations_user_prompt?: string | null
          general_model?: string | null
          general_reasoning_effort?: string | null
          general_verbosity?: string | null
          get_evaluations_model?: string | null
          get_evaluations_reasoning_effort?: string | null
          get_evaluations_verbosity?: string | null
          id?: string
          is_active?: boolean | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_reasoning_effort?: string | null
          lookup_verbosity?: string | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_reasoning_effort?: string | null
          recommendation_verbosity?: string | null
          router_model?: string | null
          router_prompt?: string | null
          router_reasoning_effort?: string | null
          router_verbosity?: string | null
          system_prompt?: string | null
        }
        Update: {
          ai_company_completion_language?: string | null
          ai_company_completion_max_tokens?: number | null
          ai_company_completion_model?: string | null
          ai_company_completion_reasoning_effort?: string | null
          ai_company_completion_system_prompt?: string | null
          ai_company_completion_user_prompt?: string | null
          ai_company_completion_verbosity?: string | null
          ai_product_completion_language?: string | null
          ai_product_completion_max_tokens?: number | null
          ai_product_completion_model?: string | null
          ai_product_completion_reasoning_effort?: string | null
          ai_product_completion_system_prompt?: string | null
          ai_product_completion_user_prompt?: string | null
          ai_product_completion_verbosity?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string
          embedding_model?: number | null
          evaluations_system_prompt?: string | null
          evaluations_user_prompt?: string | null
          general_model?: string | null
          general_reasoning_effort?: string | null
          general_verbosity?: string | null
          get_evaluations_model?: string | null
          get_evaluations_reasoning_effort?: string | null
          get_evaluations_verbosity?: string | null
          id?: string
          is_active?: boolean | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_reasoning_effort?: string | null
          lookup_verbosity?: string | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_reasoning_effort?: string | null
          recommendation_verbosity?: string | null
          router_model?: string | null
          router_prompt?: string | null
          router_reasoning_effort?: string | null
          router_verbosity?: string | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      agent_prompts_dev: {
        Row: {
          evaluate_product_prompt: string | null
          general_frequency_penalty: number | null
          general_model: string | null
          general_streaming: boolean | null
          general_temperature: number | null
          general_top_p: number | null
          get_evaluations_frequency_penalty: number | null
          get_evaluations_model: string | null
          get_evaluations_response_format: string | null
          get_evaluations_temperature: number | null
          get_evaluations_top_p: number | null
          id: number
          lookup_frequency_penalty: number | null
          lookup_model: string | null
          lookup_prompt: string | null
          lookup_streaming: boolean | null
          lookup_temperature: number | null
          lookup_top_p: number | null
          recommendation_frequency_penalty: number | null
          recommendation_model: string | null
          recommendation_prompt: string | null
          recommendation_streaming: boolean | null
          recommendation_temperature: number | null
          recommendation_top_p: number | null
          router_frequency_penalty: number | null
          router_model: string | null
          router_prompt: string | null
          router_streaming: boolean | null
          router_temperature: number | null
          router_top_p: number | null
          system_prompt: string | null
        }
        Insert: {
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: number
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Update: {
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: number
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      agent_prompts_prod: {
        Row: {
          evaluate_product_prompt: string | null
          general_frequency_penalty: number | null
          general_model: string | null
          general_streaming: boolean | null
          general_temperature: number | null
          general_top_p: number | null
          get_evaluations_frequency_penalty: number | null
          get_evaluations_model: string | null
          get_evaluations_response_format: string | null
          get_evaluations_temperature: number | null
          get_evaluations_top_p: number | null
          id: number
          lookup_frequency_penalty: number | null
          lookup_model: string | null
          lookup_prompt: string | null
          lookup_streaming: boolean | null
          lookup_temperature: number | null
          lookup_top_p: number | null
          recommendation_frequency_penalty: number | null
          recommendation_model: string | null
          recommendation_prompt: string | null
          recommendation_streaming: boolean | null
          recommendation_temperature: number | null
          recommendation_top_p: number | null
          router_frequency_penalty: number | null
          router_model: string | null
          router_prompt: string | null
          router_streaming: boolean | null
          router_temperature: number | null
          router_top_p: number | null
          system_prompt: string | null
        }
        Insert: {
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: number
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Update: {
          evaluate_product_prompt?: string | null
          general_frequency_penalty?: number | null
          general_model?: string | null
          general_streaming?: boolean | null
          general_temperature?: number | null
          general_top_p?: number | null
          get_evaluations_frequency_penalty?: number | null
          get_evaluations_model?: string | null
          get_evaluations_response_format?: string | null
          get_evaluations_temperature?: number | null
          get_evaluations_top_p?: number | null
          id?: number
          lookup_frequency_penalty?: number | null
          lookup_model?: string | null
          lookup_prompt?: string | null
          lookup_streaming?: boolean | null
          lookup_temperature?: number | null
          lookup_top_p?: number | null
          recommendation_frequency_penalty?: number | null
          recommendation_model?: string | null
          recommendation_prompt?: string | null
          recommendation_streaming?: boolean | null
          recommendation_temperature?: number | null
          recommendation_top_p?: number | null
          router_frequency_penalty?: number | null
          router_model?: string | null
          router_prompt?: string | null
          router_streaming?: boolean | null
          router_temperature?: number | null
          router_top_p?: number | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      app_user: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          company_id: string | null
          company_position: string | null
          id: string
          is_admin: boolean | null
          is_verified: boolean | null
          name: string | null
          onboarding_completed: boolean | null
          surname: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_position?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          surname?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_position?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          surname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_user_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          sender_type: string
          source_type: string | null
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_type: string
          source_type?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_type?: string
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          created_at: string | null
          id: string
          processed: boolean | null
          reviewed: boolean | null
          role: string
          to_review: boolean | null
          url_root: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          reviewed?: boolean | null
          role: string
          to_review?: boolean | null
          url_root: string
        }
        Update: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          reviewed?: boolean | null
          role?: string
          to_review?: boolean | null
          url_root?: string
        }
        Relationships: []
      }
      company_admin_requests: {
        Row: {
          comments: string | null
          company_id: string
          created_at: string
          documents: string[] | null
          id: string
          linkedin_url: string
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          comments?: string | null
          company_id: string
          created_at?: string
          documents?: string[] | null
          id?: string
          linkedin_url: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          comments?: string | null
          company_id?: string
          created_at?: string
          documents?: string[] | null
          id?: string
          linkedin_url?: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_company_admin_requests_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_cover_images: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_url: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image_url: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_url?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_cover_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      company_requests: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: string
          url: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          url: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      company_revision: {
        Row: {
          certifications: Json | null
          cities: Json | null
          comment: string | null
          company_id: string
          contact_emails: Json | null
          contact_phones: Json | null
          cost: number | null
          countries: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          embedded: boolean | null
          gps_coordinates: Json | null
          id: string
          is_active: boolean | null
          logo: string | null
          main_activities: string | null
          main_customers: Json | null
          nombre_empresa: string | null
          processed: boolean | null
          products_services_json: Json | null
          revenues: Json | null
          score: number | null
          score_rationale: string | null
          sectors: string | null
          slug: string | null
          source: string
          strengths: string | null
          website: string | null
          youtube_url: string | null
        }
        Insert: {
          certifications?: Json | null
          cities?: Json | null
          comment?: string | null
          company_id: string
          contact_emails?: Json | null
          contact_phones?: Json | null
          cost?: number | null
          countries?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedded?: boolean | null
          gps_coordinates?: Json | null
          id?: string
          is_active?: boolean | null
          logo?: string | null
          main_activities?: string | null
          main_customers?: Json | null
          nombre_empresa?: string | null
          processed?: boolean | null
          products_services_json?: Json | null
          revenues?: Json | null
          score?: number | null
          score_rationale?: string | null
          sectors?: string | null
          slug?: string | null
          source: string
          strengths?: string | null
          website?: string | null
          youtube_url?: string | null
        }
        Update: {
          certifications?: Json | null
          cities?: Json | null
          comment?: string | null
          company_id?: string
          contact_emails?: Json | null
          contact_phones?: Json | null
          cost?: number | null
          countries?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedded?: boolean | null
          gps_coordinates?: Json | null
          id?: string
          is_active?: boolean | null
          logo?: string | null
          main_activities?: string | null
          main_customers?: Json | null
          nombre_empresa?: string | null
          processed?: boolean | null
          products_services_json?: Json | null
          revenues?: Json | null
          score?: number | null
          score_rationale?: string | null
          sectors?: string | null
          slug?: string | null
          source?: string
          strengths?: string | null
          website?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_revision_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_revision_activations: {
        Row: {
          activated_at: string
          activated_by: string
          company_revision_id: string
          created_at: string
          id: string
        }
        Insert: {
          activated_at?: string
          activated_by: string
          company_revision_id: string
          created_at?: string
          id?: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          company_revision_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_revision_activations_company_revision_id_fkey"
            columns: ["company_revision_id"]
            isOneToOne: false
            referencedRelation: "company_revision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_revision_activations_company_revision_id_fkey"
            columns: ["company_revision_id"]
            isOneToOne: false
            referencedRelation: "company_revision_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          preview: string | null
          user_id: string | null
          ws_open: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          preview?: string | null
          user_id?: string | null
          ws_open?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          preview?: string | null
          user_id?: string | null
          ws_open?: boolean
        }
        Relationships: []
      }
      developer_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      developer_company_request_reviews: {
        Row: {
          company_request_id: string
          created_at: string
          developer_user_id: string
          id: string
          reviewed_at: string
        }
        Insert: {
          company_request_id: string
          created_at?: string
          developer_user_id: string
          id?: string
          reviewed_at?: string
        }
        Update: {
          company_request_id?: string
          created_at?: string
          developer_user_id?: string
          id?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_company_request_reviews_company_request_id_fkey"
            columns: ["company_request_id"]
            isOneToOne: false
            referencedRelation: "company_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_error_reviews: {
        Row: {
          created_at: string
          developer_user_id: string
          error_report_id: string
          id: string
          reviewed_at: string
        }
        Insert: {
          created_at?: string
          developer_user_id: string
          error_report_id: string
          id?: string
          reviewed_at?: string
        }
        Update: {
          created_at?: string
          developer_user_id?: string
          error_report_id?: string
          id?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_error_reviews_error_report_id_fkey"
            columns: ["error_report_id"]
            isOneToOne: false
            referencedRelation: "error_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_feedback_reviews: {
        Row: {
          created_at: string
          developer_user_id: string
          feedback_id: string
          id: string
          reviewed_at: string
        }
        Insert: {
          created_at?: string
          developer_user_id: string
          feedback_id: string
          id?: string
          reviewed_at?: string
        }
        Update: {
          created_at?: string
          developer_user_id?: string
          feedback_id?: string
          id?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_feedback_reviews_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "user_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding: {
        Row: {
          chunk_size: number | null
          id: string
          id_company_revision: string | null
          id_product_revision: string | null
          is_active: boolean | null
          text: string
          vector2: string | null
        }
        Insert: {
          chunk_size?: number | null
          id?: string
          id_company_revision?: string | null
          id_product_revision?: string | null
          is_active?: boolean | null
          text: string
          vector2?: string | null
        }
        Update: {
          chunk_size?: number | null
          id?: string
          id_company_revision?: string | null
          id_product_revision?: string | null
          is_active?: boolean | null
          text?: string
          vector2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_chunk_id_product_revision_fkey"
            columns: ["id_product_revision"]
            isOneToOne: false
            referencedRelation: "product_revision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_chunk_id_product_revision_fkey"
            columns: ["id_product_revision"]
            isOneToOne: false
            referencedRelation: "product_revision_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_id_company_revision_fkey"
            columns: ["id_company_revision"]
            isOneToOne: false
            referencedRelation: "company_revision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_id_company_revision_fkey"
            columns: ["id_company_revision"]
            isOneToOne: false
            referencedRelation: "company_revision_public"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_usage_counters: {
        Row: {
          embedding_id: string
          id: number
          match_percentages: string | null
          positions: string | null
          usage_count: number
          vector_similarities: string | null
        }
        Insert: {
          embedding_id: string
          id?: number
          match_percentages?: string | null
          positions?: string | null
          usage_count?: number
          vector_similarities?: string | null
        }
        Update: {
          embedding_id?: string
          id?: number
          match_percentages?: string | null
          positions?: string | null
          usage_count?: number
          vector_similarities?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_usage_counters_embedding_id_fkey"
            columns: ["embedding_id"]
            isOneToOne: true
            referencedRelation: "embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          conversation_id: string
          created_at: string
          description: string | null
          id: string
          resolution_comment: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          description?: string | null
          id?: string
          resolution_comment?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          description?: string | null
          id?: string
          resolution_comment?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      evaluation_ratings: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          rating: number
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          rating: number
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          rating?: number
          user_id?: string | null
        }
        Relationships: []
      }
      product: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      product_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          product_id: string
          product_revision_id: string | null
          source: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          product_id: string
          product_revision_id?: string | null
          source: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          product_id?: string
          product_revision_id?: string | null
          source?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_revision_id_fkey"
            columns: ["product_revision_id"]
            isOneToOne: false
            referencedRelation: "product_revision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_revision_id_fkey"
            columns: ["product_revision_id"]
            isOneToOne: false
            referencedRelation: "product_revision_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_revision: {
        Row: {
          comment: string | null
          created_at: string | null
          created_by: string | null
          definition_score: string | null
          embedded: boolean | null
          id: string
          image: string | null
          improvement_advice: string | null
          is_active: boolean | null
          json_raw: Json | null
          key_features: string | null
          long_description: string | null
          main_category: string | null
          pdf_url: string | null
          product_id: string
          product_name: string | null
          product_url: string | null
          short_description: string | null
          source: string
          source_urls: string | null
          subcategories: string | null
          target_industries: string | null
          use_cases: string | null
          youtube_url: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          definition_score?: string | null
          embedded?: boolean | null
          id?: string
          image?: string | null
          improvement_advice?: string | null
          is_active?: boolean | null
          json_raw?: Json | null
          key_features?: string | null
          long_description?: string | null
          main_category?: string | null
          pdf_url?: string | null
          product_id: string
          product_name?: string | null
          product_url?: string | null
          short_description?: string | null
          source: string
          source_urls?: string | null
          subcategories?: string | null
          target_industries?: string | null
          use_cases?: string | null
          youtube_url?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          definition_score?: string | null
          embedded?: boolean | null
          id?: string
          image?: string | null
          improvement_advice?: string | null
          is_active?: boolean | null
          json_raw?: Json | null
          key_features?: string | null
          long_description?: string | null
          main_category?: string | null
          pdf_url?: string | null
          product_id?: string
          product_name?: string | null
          product_url?: string | null
          short_description?: string | null
          source?: string
          source_urls?: string | null
          subcategories?: string | null
          target_industries?: string | null
          use_cases?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_revision_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      product_revision_history: {
        Row: {
          action_at: string
          action_by: string
          action_type: string
          created_at: string
          id: string
          product_revision_id: string
        }
        Insert: {
          action_at?: string
          action_by: string
          action_type?: string
          created_at?: string
          id?: string
          product_revision_id: string
        }
        Update: {
          action_at?: string
          action_by?: string
          action_type?: string
          created_at?: string
          id?: string
          product_revision_id?: string
        }
        Relationships: []
      }
      prompts_webscrapping: {
        Row: {
          id: number | null
          model: string | null
          prompt_company_system: string | null
          prompt_company_user: string | null
          prompt_products1_system: string | null
          prompt_products1_user: string | null
          prompt_products2_system: string | null
          prompt_products2_user: string | null
        }
        Insert: {
          id?: number | null
          model?: string | null
          prompt_company_system?: string | null
          prompt_company_user?: string | null
          prompt_products1_system?: string | null
          prompt_products1_user?: string | null
          prompt_products2_system?: string | null
          prompt_products2_user?: string | null
        }
        Update: {
          id?: number | null
          model?: string | null
          prompt_company_system?: string | null
          prompt_company_user?: string | null
          prompt_products1_system?: string | null
          prompt_products1_user?: string | null
          prompt_products2_system?: string | null
          prompt_products2_user?: string | null
        }
        Relationships: []
      }
      saved_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          list_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          list_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          list_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_companies_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "supplier_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription: {
        Row: {
          created_at: string | null
          end_date: string | null
          id_company: string
          is_active: boolean | null
          start_date: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id_company: string
          is_active?: boolean | null
          start_date?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id_company?: string
          is_active?: boolean | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_id_company_fkey"
            columns: ["id_company"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_lists: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          category: string | null
          created_at: string
          feedback_text: string
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          feedback_text: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          feedback_text?: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_type_selections: {
        Row: {
          company_id: string | null
          company_name: string | null
          company_url: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          company_id?: string | null
          company_name?: string | null
          company_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          user_type: string
        }
        Update: {
          company_id?: string | null
          company_name?: string | null
          company_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      company_revision_public: {
        Row: {
          certifications: Json | null
          cities: Json | null
          company_id: string | null
          countries: Json | null
          description: string | null
          gps_coordinates: Json | null
          id: string | null
          main_activities: string | null
          nombre_empresa: string | null
          revenues: Json | null
          sectors: string | null
          strengths: string | null
          website: string | null
        }
        Insert: {
          certifications?: Json | null
          cities?: Json | null
          company_id?: string | null
          countries?: Json | null
          description?: string | null
          gps_coordinates?: Json | null
          id?: string | null
          main_activities?: string | null
          nombre_empresa?: string | null
          revenues?: Json | null
          sectors?: string | null
          strengths?: string | null
          website?: string | null
        }
        Update: {
          certifications?: Json | null
          cities?: Json | null
          company_id?: string | null
          countries?: Json | null
          description?: string | null
          gps_coordinates?: Json | null
          id?: string | null
          main_activities?: string | null
          nombre_empresa?: string | null
          revenues?: Json | null
          sectors?: string | null
          strengths?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_revision_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      product_revision_public: {
        Row: {
          id: string | null
          key_features: string | null
          long_description: string | null
          main_category: string | null
          product_id: string | null
          product_name: string | null
          product_url: string | null
          short_description: string | null
          source: string | null
          source_urls: string | null
          subcategories: string | null
          target_industries: string | null
          use_cases: string | null
        }
        Insert: {
          id?: string | null
          key_features?: string | null
          long_description?: string | null
          main_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_url?: string | null
          short_description?: string | null
          source?: string | null
          source_urls?: string | null
          subcategories?: string | null
          target_industries?: string | null
          use_cases?: string | null
        }
        Update: {
          id?: string | null
          key_features?: string | null
          long_description?: string | null
          main_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_url?: string | null
          short_description?: string | null
          source?: string | null
          source_urls?: string | null
          subcategories?: string | null
          target_industries?: string | null
          use_cases?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_revision_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_company_admin_request: {
        Args: { p_processor_user_id?: string; p_request_id: string }
        Returns: boolean
      }
      batch_increment_embedding_counters: {
        Args: { p_embedding_ids: string[] }
        Returns: undefined
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      deactivate_company_revisions: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_product_embeddings: {
        Args: { p_product_revision_id: string }
        Returns: undefined
      }
      dmetaphone: {
        Args: { "": string }
        Returns: string
      }
      dmetaphone_alt: {
        Args: { "": string }
        Returns: string
      }
      generate_slug: {
        Args: { input_text: string }
        Returns: string
      }
      get_company_admin_request_processor_name: {
        Args: { processor_user_id: string }
        Returns: {
          name: string
          surname: string
        }[]
      }
      get_company_pending_admin_requests: {
        Args: { p_company_id: string; p_requestor_user_id?: string }
        Returns: {
          comments: string
          company_id: string
          created_at: string
          id: string
          linkedin_url: string
          user_email: string
          user_id: string
          user_name: string
          user_surname: string
        }[]
      }
      get_company_revision_by_product_revision: {
        Args: { p_only_active?: boolean; p_product_revision_id: string }
        Returns: {
          company_id: string
          id_company_revision: string
          nombre_empresa: string
        }[]
      }
      get_embedding_analytics_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          embedding_id: string
          embedding_text: string
          id_company_revision: string
          id_product_revision: string
          match_percentages: string
          positions: string
          usage_count: number
          vector_similarities: string
        }[]
      }
      get_embedding_usage_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          least_used_count: number
          least_used_embedding_id: string
          most_used_count: number
          most_used_embedding_id: string
          total_embeddings: number
          total_usage_count: number
        }[]
      }
      get_product_revision_clean: {
        Args: { p_id: string }
        Returns: {
          definition_score: string
          id: string
          image: string
          improvement_advice: string
          key_features: string
          long_description: string
          main_category: string
          product_name: string
          source_urls: string
          subcategories: string
          target_industries: string
          use_cases: string
        }[]
      }
      get_products_by_company_revision: {
        Args: { p_company_revision_id: string; p_only_active?: boolean }
        Returns: {
          id_product_revision: string
          product_id: string
          product_name: string
        }[]
      }
      get_user_info_for_company_admins: {
        Args: { target_user_id: string }
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          surname: string
        }[]
      }
      get_all_users_for_analytics: {
        Args: {}
        Returns: {
          id: string
          email: string
          email_confirmed_at: string | null
          confirmation_sent_at: string | null
          last_sign_in_at: string | null
          created_at: string
          updated_at: string
          confirmed_at: string | null
        }[]
      }
      get_user_info_for_developers: {
        Args: { target_user_id: string }
        Returns: {
          created_at: string
          email: string
          id: string
        }[]
      }
      get_users_with_emails_batch: {
        Args: { user_ids: string[] }
        Returns: {
          auth_user_id: string
          company_position: string
          email: string
          id: string
          name: string
          surname: string
        }[]
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_developer_access: {
        Args: { check_user_id?: string }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      increment_embedding_counter: {
        Args: { p_embedding_id: string }
        Returns: undefined
      }
      increment_embedding_counter_with_data: {
        Args: { p_embedding_id: string; p_matches: string; p_positions: string }
        Returns: undefined
      }
      is_admin_user: {
        Args: { user_id?: string }
        Returns: boolean
      }
      is_approved_company_admin: {
        Args: { p_company_id: string; p_user_id?: string }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      match_documents: {
        Args:
          | { filter?: Json; match_count?: number; query_embedding?: string }
          | {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
        Returns: {
          content: string
          metadata: Json
        }[]
      }
      match_embeddings: {
        Args:
          | {
              match_count: number
              match_threshold: number
              query_embedding: number[]
              vector_column?: string
            }
          | {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_3large: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_3small: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_3small_balanced: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_3small_fixed: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_3small_optimized: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      match_embeddings_ada002: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          id_company_revision: string
          id_product_revision: string
          similarity: number
          text: string
        }[]
      }
      reject_company_admin_request: {
        Args: {
          p_processor_user_id?: string
          p_rejection_reason?: string
          p_request_id: string
        }
        Returns: boolean
      }
      remove_company_admin: {
        Args: { p_company_id: string; p_removed_by?: string; p_user_id: string }
        Returns: boolean
      }
      soundex: {
        Args: { "": string }
        Returns: string
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      text_soundex: {
        Args: { "": string }
        Returns: string
      }
      upsert_embedding_counter_with_data: {
        Args: {
          p_embedding_id: string
          p_matches: string
          p_positions: string
          p_similarities: string
        }
        Returns: undefined
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
