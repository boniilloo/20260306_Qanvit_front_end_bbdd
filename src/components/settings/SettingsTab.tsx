import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Save, Upload, History, User, Bot } from "lucide-react";

interface AgentConfig {
  id?: number;
  // Prompts principales
  system_prompt?: string;
  recommendation_prompt?: string;
  lookup_prompt?: string;
  router_prompt?: string;
  
  // Router parameters
  router_model?: string;
  router_reasoning_effort?: string;
  router_verbosity?: string;
  
  // Lookup parameters
  lookup_model?: string;
  lookup_reasoning_effort?: string;
  lookup_verbosity?: string;
  
  // Recommendation parameters
  recommendation_model?: string;
  recommendation_reasoning_effort?: string;
  recommendation_verbosity?: string;
  
  // General parameters
  general_model?: string;
  general_reasoning_effort?: string;
  general_verbosity?: string;
  
  // Get Evaluations parameters
  get_evaluations_model?: string;
  get_evaluations_reasoning_effort?: string;
  get_evaluations_verbosity?: string;
  evaluations_system_prompt?: string;
  evaluations_user_prompt?: string;
  
  // Embedding model
  embedding_model?: number;
  
  // AI Product Completion parameters
  ai_product_completion_system_prompt?: string;
  ai_product_completion_user_prompt?: string;
  ai_product_completion_model?: string;
  ai_product_completion_max_tokens?: number;
  ai_product_completion_reasoning_effort?: string;
  ai_product_completion_verbosity?: string;
  ai_product_completion_language?: string;
  
  // AI Company Completion parameters
  ai_company_completion_system_prompt?: string;
  ai_company_completion_user_prompt?: string;
  ai_company_completion_model?: string;
  ai_company_completion_max_tokens?: number;
  ai_company_completion_reasoning_effort?: string;
  ai_company_completion_verbosity?: string;
  ai_company_completion_language?: string;
  
  // Technical Info Node parameters
  technical_info_node_prompt?: string;
  technical_info_node_model?: string;
  technical_info_node_temperature?: number;
  technical_info_node_max_tokens?: number;
  technical_info_node_verbosity?: string;
  technical_info_node_reasoning_effort?: string;
  
  // Technical Decision Node parameters
  technical_decision_node_prompt?: string;
  technical_decision_node_model?: string;
  technical_decision_node_temperature?: number;
  technical_decision_node_max_tokens?: number;
  technical_decision_node_verbosity?: string;
  technical_decision_node_reasoning_effort?: string;
  
  // Company Info Node parameters
  company_info_node_prompt?: string;
  company_info_node_model?: string;
  company_info_node_temperature?: number;
  company_info_node_max_tokens?: number;
  company_info_node_verbosity?: string;
  company_info_node_reasoning_effort?: string;
  
  // Company Decision Node parameters
  company_decision_node_prompt?: string;
  company_decision_node_model?: string;
  company_decision_node_temperature?: number;
  company_decision_node_max_tokens?: number;
  company_decision_node_verbosity?: string;
  company_decision_node_reasoning_effort?: string;
  
  // Evaluation Node parameters
  evaluation_node_prompt?: string;
  evaluation_node_model?: string;
  evaluation_node_temperature?: number;
  evaluation_node_max_tokens?: number;
  evaluation_node_verbosity?: string;
  evaluation_node_reasoning_effort?: string;
  
  // Company Evaluation parameters
  company_evaluation_system_prompt?: string;
  company_evaluation_user_prompt?: string;
  company_evaluation_model?: string;
  company_evaluation_temperature?: number;
  company_evaluation_max_tokens?: number;
  company_evaluation_verbosity?: string;
  company_evaluation_reasoning_effort?: string;
  company_evaluation_response_format?: string;
  
  // RFX Conversational parameters
  rfx_conversational_system_prompt?: string;
  
  // Propose Edits parameters
  propose_edits_system_prompt?: string;
  propose_edits_default_language?: string;
  
  // RFX Analysis parameters
  rfx_analysis_system_prompt?: string;
  rfx_analysis_user_prompt?: string;
  rfx_analysis_model?: string;
  rfx_analysis_verbosity?: string;
  rfx_analysis_reasoning_effort?: string;
}

interface BackupConfig {
  id: string;
  created_at: string;
  created_by: string;
  comment?: string;
  is_active?: boolean;
  
  // Prompts principales
  system_prompt?: string;
  recommendation_prompt?: string;
  lookup_prompt?: string;
  router_prompt?: string;
  
  // Router parameters
  router_model?: string;
  router_reasoning_effort?: string;
  router_verbosity?: string;
  
  // Lookup parameters
  lookup_model?: string;
  lookup_reasoning_effort?: string;
  lookup_verbosity?: string;
  
  // Recommendation parameters
  recommendation_model?: string;
  recommendation_reasoning_effort?: string;
  recommendation_verbosity?: string;
  
  // General parameters
  general_model?: string;
  general_reasoning_effort?: string;
  general_verbosity?: string;
  
  // Get Evaluations parameters
  get_evaluations_model?: string;
  get_evaluations_reasoning_effort?: string;
  get_evaluations_verbosity?: string;
  evaluations_system_prompt?: string;
  evaluations_user_prompt?: string;
  
  // Embedding model
  embedding_model?: number;
  
  // AI Product Completion parameters
  ai_product_completion_system_prompt?: string;
  ai_product_completion_user_prompt?: string;
  ai_product_completion_model?: string;
  ai_product_completion_max_tokens?: number;
  ai_product_completion_reasoning_effort?: string;
  ai_product_completion_verbosity?: string;
  ai_product_completion_language?: string;
  
  // AI Company Completion parameters
  ai_company_completion_system_prompt?: string;
  ai_company_completion_user_prompt?: string;
  ai_company_completion_model?: string;
  ai_company_completion_max_tokens?: number;
  ai_company_completion_reasoning_effort?: string;
  ai_company_completion_verbosity?: string;
  ai_company_completion_language?: string;
  
  // Technical Info Node parameters
  technical_info_node_prompt?: string;
  technical_info_node_model?: string;
  technical_info_node_temperature?: number;
  technical_info_node_max_tokens?: number;
  technical_info_node_verbosity?: string;
  technical_info_node_reasoning_effort?: string;
  
  // Technical Decision Node parameters
  technical_decision_node_prompt?: string;
  technical_decision_node_model?: string;
  technical_decision_node_temperature?: number;
  technical_decision_node_max_tokens?: number;
  technical_decision_node_verbosity?: string;
  technical_decision_node_reasoning_effort?: string;
  
  // Company Info Node parameters
  company_info_node_prompt?: string;
  company_info_node_model?: string;
  company_info_node_temperature?: number;
  company_info_node_max_tokens?: number;
  company_info_node_verbosity?: string;
  company_info_node_reasoning_effort?: string;
  
  // Company Decision Node parameters
  company_decision_node_prompt?: string;
  company_decision_node_model?: string;
  company_decision_node_temperature?: number;
  company_decision_node_max_tokens?: number;
  company_decision_node_verbosity?: string;
  company_decision_node_reasoning_effort?: string;
  
  // Evaluation Node parameters
  evaluation_node_prompt?: string;
  evaluation_node_model?: string;
  evaluation_node_temperature?: number;
  evaluation_node_max_tokens?: number;
  evaluation_node_verbosity?: string;
  evaluation_node_reasoning_effort?: string;
  
  // Company Evaluation parameters
  company_evaluation_system_prompt?: string;
  company_evaluation_user_prompt?: string;
  company_evaluation_model?: string;
  company_evaluation_temperature?: number;
  company_evaluation_max_tokens?: number;
  company_evaluation_verbosity?: string;
  company_evaluation_reasoning_effort?: string;
  company_evaluation_response_format?: string;
  
  // RFX Conversational parameters
  rfx_conversational_system_prompt?: string;
  
  // Propose Edits parameters
  propose_edits_system_prompt?: string;
  propose_edits_default_language?: string;
  
  // RFX Analysis parameters
  rfx_analysis_system_prompt?: string;
  rfx_analysis_user_prompt?: string;
  rfx_analysis_model?: string;
  rfx_analysis_verbosity?: string;
  rfx_analysis_reasoning_effort?: string;
}

// Move LLMGroup outside of the main component to prevent re-creation on each render
const LLMGroup = ({ 
  title, 
  prefix, 
  description, 
  promptKey,
  config,
  updateConfigValue
}: { 
  title: string; 
  prefix: string; 
  description: string;
  promptKey?: keyof AgentConfig;
  config: AgentConfig;
  updateConfigValue: (key: keyof AgentConfig, value: any) => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Bot className="h-5 w-5" />
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {promptKey && (
        <div>
          <Label htmlFor={promptKey}>Prompt</Label>
          <Textarea
            id={promptKey}
            value={config[promptKey] as string || ''}
            onChange={(e) => updateConfigValue(promptKey, e.target.value)}
            rows={16}
            className="mt-1"
          />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${prefix}_model`}>Model</Label>
          <Input
            id={`${prefix}_model`}
            value={config[`${prefix}_model` as keyof AgentConfig] as string || ''}
            onChange={(e) => updateConfigValue(`${prefix}_model` as keyof AgentConfig, e.target.value)}
            placeholder="e.g., gpt-5-2025-08-07, gpt-4.1-2025-04-14"
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_reasoning_effort`}>Reasoning Effort</Label>
          <Select
            value={config[`${prefix}_reasoning_effort` as keyof AgentConfig] as string || 'medium'}
            onValueChange={(value) => updateConfigValue(`${prefix}_reasoning_effort` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reasoning effort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${prefix}_verbosity`}>Verbosity</Label>
          <Select
            value={config[`${prefix}_verbosity` as keyof AgentConfig] as string || 'medium'}
            onValueChange={(value) => updateConfigValue(`${prefix}_verbosity` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select verbosity level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Extended LLMGroup with temperature and max_tokens fields
const LLMGroupExtended = ({ 
  title, 
  prefix, 
  description, 
  promptKey,
  config,
  updateConfigValue
}: { 
  title: string; 
  prefix: string; 
  description: string;
  promptKey?: keyof AgentConfig;
  config: AgentConfig;
  updateConfigValue: (key: keyof AgentConfig, value: any) => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Bot className="h-5 w-5" />
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {promptKey && (
        <div>
          <Label htmlFor={promptKey}>Prompt</Label>
          <Textarea
            id={promptKey}
            value={config[promptKey] as string || ''}
            onChange={(e) => updateConfigValue(promptKey, e.target.value)}
            rows={16}
            className="mt-1"
          />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${prefix}_model`}>Model</Label>
          <Input
            id={`${prefix}_model`}
            value={config[`${prefix}_model` as keyof AgentConfig] as string || ''}
            onChange={(e) => updateConfigValue(`${prefix}_model` as keyof AgentConfig, e.target.value)}
            placeholder="e.g., gpt-5-mini, gpt-4o"
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_temperature`}>Temperature</Label>
          <Input
            id={`${prefix}_temperature`}
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={config[`${prefix}_temperature` as keyof AgentConfig] as number || 0.1}
            onChange={(e) => updateConfigValue(`${prefix}_temperature` as keyof AgentConfig, parseFloat(e.target.value))}
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_max_tokens`}>Max Tokens</Label>
          <Input
            id={`${prefix}_max_tokens`}
            type="number"
            min="100"
            max="10000"
            value={config[`${prefix}_max_tokens` as keyof AgentConfig] as number || 1000}
            onChange={(e) => updateConfigValue(`${prefix}_max_tokens` as keyof AgentConfig, parseInt(e.target.value))}
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_verbosity`}>Verbosity</Label>
          <Select
            value={config[`${prefix}_verbosity` as keyof AgentConfig] as string || 'low'}
            onValueChange={(value) => updateConfigValue(`${prefix}_verbosity` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select verbosity level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${prefix}_reasoning_effort`}>Reasoning Effort</Label>
          <Select
            value={config[`${prefix}_reasoning_effort` as keyof AgentConfig] as string || 'medium'}
            onValueChange={(value) => updateConfigValue(`${prefix}_reasoning_effort` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reasoning effort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Company Evaluation Group with system_prompt, user_prompt, and response_format
const CompanyEvaluationGroup = ({ 
  title, 
  prefix, 
  description, 
  config,
  updateConfigValue
}: { 
  title: string; 
  prefix: string; 
  description: string;
  config: AgentConfig;
  updateConfigValue: (key: keyof AgentConfig, value: any) => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Bot className="h-5 w-5" />
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label htmlFor={`${prefix}_system_prompt`}>System Prompt</Label>
        <Textarea
          id={`${prefix}_system_prompt`}
          value={config[`${prefix}_system_prompt` as keyof AgentConfig] as string || ''}
          onChange={(e) => updateConfigValue(`${prefix}_system_prompt` as keyof AgentConfig, e.target.value)}
          rows={8}
          className="mt-1"
          placeholder="System prompt for company evaluation..."
        />
      </div>
      
      <div>
        <Label htmlFor={`${prefix}_user_prompt`}>User Prompt</Label>
        <Textarea
          id={`${prefix}_user_prompt`}
          value={config[`${prefix}_user_prompt` as keyof AgentConfig] as string || ''}
          onChange={(e) => updateConfigValue(`${prefix}_user_prompt` as keyof AgentConfig, e.target.value)}
          rows={8}
          className="mt-1"
          placeholder="User prompt template for company evaluation..."
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${prefix}_model`}>Model</Label>
          <Input
            id={`${prefix}_model`}
            value={config[`${prefix}_model` as keyof AgentConfig] as string || ''}
            onChange={(e) => updateConfigValue(`${prefix}_model` as keyof AgentConfig, e.target.value)}
            placeholder="e.g., gpt-5-nano, gpt-4o-mini"
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_temperature`}>Temperature</Label>
          <Input
            id={`${prefix}_temperature`}
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={config[`${prefix}_temperature` as keyof AgentConfig] as number || 0.1}
            onChange={(e) => updateConfigValue(`${prefix}_temperature` as keyof AgentConfig, parseFloat(e.target.value))}
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_max_tokens`}>Max Tokens</Label>
          <Input
            id={`${prefix}_max_tokens`}
            type="number"
            min="100"
            max="10000"
            value={config[`${prefix}_max_tokens` as keyof AgentConfig] as number || 500}
            onChange={(e) => updateConfigValue(`${prefix}_max_tokens` as keyof AgentConfig, parseInt(e.target.value))}
          />
        </div>

        <div>
          <Label htmlFor={`${prefix}_verbosity`}>Verbosity</Label>
          <Select
            value={config[`${prefix}_verbosity` as keyof AgentConfig] as string || 'low'}
            onValueChange={(value) => updateConfigValue(`${prefix}_verbosity` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select verbosity level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${prefix}_reasoning_effort`}>Reasoning Effort</Label>
          <Select
            value={config[`${prefix}_reasoning_effort` as keyof AgentConfig] as string || 'low'}
            onValueChange={(value) => updateConfigValue(`${prefix}_reasoning_effort` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reasoning effort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${prefix}_response_format`}>Response Format</Label>
          <Select
            value={config[`${prefix}_response_format` as keyof AgentConfig] as string || 'json_object'}
            onValueChange={(value) => updateConfigValue(`${prefix}_response_format` as keyof AgentConfig, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select response format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json_object">JSON Object</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardContent>
  </Card>
);

const SettingsTab = () => {
  const [config, setConfig] = useState<AgentConfig>({});
  const [currentActiveConfig, setCurrentActiveConfig] = useState<AgentConfig>({});
  const [backups, setBackups] = useState<BackupConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveComment, setSaveComment] = useState('');
  const [userName, setUserName] = useState('User');
  const [showBackups, setShowBackups] = useState(false);

  // Load active configuration from agent_prompt_backups_v2
  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_prompt_backups_v2')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error loading active config:', error);
        toast({
          title: "Error",
          description: "Failed to load active configuration.",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        const { id, created_at, created_by, comment, is_active, ...configData } = data;
        setConfig(configData);
        setCurrentActiveConfig(configData);
      } else {
        // If no active config exists, create a default one
        const defaultConfig = {
          system_prompt: "You are a helpful AI assistant.",
          router_model: "gpt-5-2025-08-07",
          router_reasoning_effort: "medium",
          router_verbosity: "medium",
          lookup_model: "gpt-5-2025-08-07", 
          lookup_reasoning_effort: "low",
          lookup_verbosity: "low",
          recommendation_model: "gpt-5-2025-08-07",
          recommendation_reasoning_effort: "medium",
          recommendation_verbosity: "medium",
          general_model: "gpt-5-2025-08-07",
          general_reasoning_effort: "medium",
          general_verbosity: "medium",
          get_evaluations_model: "gpt-5-2025-08-07",
          get_evaluations_reasoning_effort: "low",
          get_evaluations_verbosity: "low",
          evaluations_system_prompt: "You are an expert evaluator of products and companies.",
          evaluations_user_prompt: "Evaluate the following: {evaluation_data}",
          embedding_model: 0,
          ai_product_completion_system_prompt: "You are an expert at completing product information based on partial data.",
          ai_product_completion_user_prompt: "Complete the following product information: {product_data}",
          ai_product_completion_model: "gpt-5-2025-08-07",
          ai_product_completion_max_tokens: 2000,
          ai_product_completion_reasoning_effort: "medium",
          ai_product_completion_verbosity: "medium",
          ai_product_completion_language: "en",

          ai_company_completion_system_prompt: "You are an expert at completing company information based on partial data.",
          ai_company_completion_user_prompt: "Complete the following company information: {company_data}",
          ai_company_completion_model: "gpt-5-2025-08-07",
          ai_company_completion_max_tokens: 2000,
          ai_company_completion_reasoning_effort: "medium",
          ai_company_completion_verbosity: "medium",
          ai_company_completion_language: "en",
          
          // Technical Info Node defaults
          technical_info_node_prompt: "You are an expert at providing technical information about products and services.",
          technical_info_node_model: "gpt-5-mini",
          technical_info_node_temperature: 0.1,
          technical_info_node_max_tokens: 1000,
          technical_info_node_verbosity: "low",
          technical_info_node_reasoning_effort: "medium",
          
          // Technical Decision Node defaults
          technical_decision_node_prompt: "You are an expert at making technical decisions based on product specifications and requirements.",
          technical_decision_node_model: "gpt-5-mini",
          technical_decision_node_temperature: 0.1,
          technical_decision_node_max_tokens: 200,
          technical_decision_node_verbosity: "low",
          technical_decision_node_reasoning_effort: "low",
          
          // Company Info Node defaults
          company_info_node_prompt: "You are an expert at providing detailed company information and business insights.",
          company_info_node_model: "gpt-5-mini",
          company_info_node_temperature: 0.1,
          company_info_node_max_tokens: 1000,
          company_info_node_verbosity: "low",
          company_info_node_reasoning_effort: "medium",
          
          // Company Decision Node defaults
          company_decision_node_prompt: "You are an expert at making business decisions based on company data and market conditions.",
          company_decision_node_model: "gpt-5-mini",
          company_decision_node_temperature: 0.1,
          company_decision_node_max_tokens: 200,
          company_decision_node_verbosity: "low",
          company_decision_node_reasoning_effort: "low",
          
          // Evaluation Node defaults
          evaluation_node_prompt: "You are an expert at evaluating products and services based on technical specifications and market requirements.",
          evaluation_node_model: "gpt-5-mini",
          evaluation_node_temperature: 0.1,
          evaluation_node_max_tokens: 2000,
          evaluation_node_verbosity: "low",
          evaluation_node_reasoning_effort: "medium",
          
          // Company Evaluation defaults
          company_evaluation_system_prompt: "You are an expert at evaluating companies based on their business profile, capabilities, and market position.",
          company_evaluation_user_prompt: "Evaluate the following company: {company_data}",
          company_evaluation_model: "gpt-5-nano",
          company_evaluation_temperature: 0.1,
          company_evaluation_max_tokens: 500,
          company_evaluation_verbosity: "low",
          company_evaluation_reasoning_effort: "low",
          company_evaluation_response_format: "json_object"
        };
        
        setConfig(defaultConfig);
        setCurrentActiveConfig(defaultConfig);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load backups
  const loadBackups = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_prompt_backups_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading backups:', error);
        return;
      }

      setBackups(data || []);
    } catch (error) {
      console.error('Error loading backups:', error);
    }
  };

  // Get user name
  const getUserName = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from('app_user')
          .select('name, surname')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        
        if (userData?.name && userData?.surname) {
          setUserName(`${userData.name} ${userData.surname}`);
        } else {
          setUserName(user.email?.split('@')[0] || 'User');
        }
      }
    } catch (error) {
      console.error('Error getting user name:', error);
    }
  };

  useEffect(() => {
    loadConfig();
    loadBackups();
    getUserName();
  }, []);

  const handleSave = async () => {
    if (!saveComment.trim()) {
      toast({
        title: "Comment required",
        description: "Please add a comment describing the changes.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // First, set all backups as inactive
      const { error: deactivateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all records

      if (deactivateError) {
        throw deactivateError;
      }

      // Create new backup and set it as active
      const { id, ...configWithoutId } = config;
      const { error: backupError } = await supabase
        .from('agent_prompt_backups_v2')
        .insert({
          ...configWithoutId,
          created_by: userName,
          comment: saveComment.trim(),
          is_active: true
        });

      if (backupError) {
        throw backupError;
      }

      setSaveComment('');
      setCurrentActiveConfig(config);
      loadBackups();
      
      toast({
        title: "Configuration saved",
        description: "The agent configuration has been updated successfully.",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadBackup = async (backup: BackupConfig) => {
    setLoading(true);
    try {
      // First, set all backups as inactive
      const { error: deactivateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all records

      if (deactivateError) {
        throw deactivateError;
      }

      // Set the selected backup as active
      const { error: activateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: true })
        .eq('id', backup.id);

      if (activateError) {
        throw activateError;
      }

      // Load the configuration
      const { id, created_at, created_by, comment, is_active, ...configData } = backup;
      setConfig(configData);
      setCurrentActiveConfig(configData);
      
      // Reload backups to reflect changes
      loadBackups();
      
      toast({
        title: "Configuration activated",
        description: `Configuration from ${new Date(created_at).toLocaleDateString()} is now active.`,
      });
    } catch (error) {
      console.error('Error activating config:', error);
      toast({
        title: "Error",
        description: "Failed to activate configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if a backup is the currently active configuration
  const isActiveConfig = (backup: BackupConfig) => {
    return backup.is_active === true;
  };

  const updateConfigValue = (key: keyof AgentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8">
      {/* LLM Configuration Tabs */}
      <Tabs defaultValue="system" className="w-full">
        {/* Primary Tab Row */}
        <TabsList className="grid w-full grid-cols-3 mb-2">
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="router">Router</TabsTrigger>
          <TabsTrigger value="lookup">Lookup</TabsTrigger>
        </TabsList>
        
        {/* Secondary Tab Row */}
        <TabsList className="grid w-full grid-cols-4 mb-2">
          <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="ai-product-completion">AI Product Completion</TabsTrigger>
          <TabsTrigger value="ai-company-completion">AI Company Completion</TabsTrigger>
        </TabsList>
        
        {/* Third Tab Row */}
        <TabsList className="grid w-full grid-cols-4 mb-2">
          <TabsTrigger value="technical-info-node">Technical Info Node</TabsTrigger>
          <TabsTrigger value="technical-decision-node">Technical Decision Node</TabsTrigger>
          <TabsTrigger value="company-info-node">Company Info Node</TabsTrigger>
          <TabsTrigger value="company-decision-node">Company Decision Node</TabsTrigger>
        </TabsList>
        
        {/* Fourth Tab Row */}
        <TabsList className="grid w-full grid-cols-2 mb-2">
          <TabsTrigger value="evaluation-node">Evaluation Node</TabsTrigger>
          <TabsTrigger value="company-evaluation">Company Evaluation</TabsTrigger>
        </TabsList>
        
        {/* Fifth Tab Row */}
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="rfx-conversational">RFX Conversational</TabsTrigger>
          <TabsTrigger value="propose-edits">Propose Edits</TabsTrigger>
          <TabsTrigger value="rfx-analysis">RFX Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          {/* System Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                System Configuration
              </CardTitle>
              <CardDescription>
                General system settings and base prompt for all agent interactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  value={config.system_prompt || ''}
                  onChange={(e) => updateConfigValue('system_prompt', e.target.value)}
                  rows={16}
                  placeholder="Enter the system prompt..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="general_model">Model</Label>
                  <Input
                    id="general_model"
                    value={config.general_model || ''}
                    onChange={(e) => updateConfigValue('general_model', e.target.value)}
                    placeholder="e.g., gpt-5-2025-08-07, gpt-4.1-2025-04-14"
                  />
                </div>

                <div>
                  <Label htmlFor="general_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.general_reasoning_effort || 'medium'}
                    onValueChange={(value) => updateConfigValue('general_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="general_verbosity">Verbosity</Label>
                  <Select
                    value={config.general_verbosity || 'medium'}
                    onValueChange={(value) => updateConfigValue('general_verbosity', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select verbosity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="router" className="space-y-6">
          <LLMGroup
            title="Router (Intent Classification)"
            prefix="router"
            description="Classifies user intent and routes requests to appropriate modules"
            promptKey="router_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="lookup" className="space-y-6">
          <LLMGroup
            title="Lookup (Information Search)"
            prefix="lookup"
            description="Searches and retrieves relevant information from the database"
            promptKey="lookup_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="recommendation" className="space-y-6">
          {/* Recommendation Engine with Embedding Model Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Recommendation Engine
              </CardTitle>
              <CardDescription>Generates product and supplier recommendations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="recommendation_prompt">Prompt</Label>
                <Textarea
                  id="recommendation_prompt"
                  value={config.recommendation_prompt || ''}
                  onChange={(e) => updateConfigValue('recommendation_prompt', e.target.value)}
                  rows={16}
                  className="mt-1"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recommendation_model">Model</Label>
                  <Input
                    id="recommendation_model"
                    value={config.recommendation_model || ''}
                    onChange={(e) => updateConfigValue('recommendation_model', e.target.value)}
                    placeholder="e.g., gpt-5-2025-08-07, gpt-4.1-2025-04-14"
                  />
                </div>

                <div>
                  <Label htmlFor="recommendation_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.recommendation_reasoning_effort || 'medium'}
                    onValueChange={(value) => updateConfigValue('recommendation_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="recommendation_verbosity">Verbosity</Label>
                  <Select
                    value={config.recommendation_verbosity || 'medium'}
                    onValueChange={(value) => updateConfigValue('recommendation_verbosity', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select verbosity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Embedding Model Selection */}
              <div>
                <Label htmlFor="embedding_model">Embedding Model</Label>
                <Select 
                  value={config.embedding_model?.toString() || "0"} 
                  onValueChange={(value) => updateConfigValue('embedding_model', parseInt(value))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select embedding model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">
                      <div className="flex flex-col">
                        <span className="font-medium">text-embedding-ada-002</span>
                        <span className="text-sm text-muted-foreground">Legacy model - Lower cost, good performance</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="1">
                      <div className="flex flex-col">
                        <span className="font-medium">text-embedding-3-large</span>
                        <span className="text-sm text-muted-foreground">Most powerful - Higher accuracy, higher cost</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="2">
                      <div className="flex flex-col">
                        <span className="font-medium">text-embedding-3-small</span>
                        <span className="text-sm text-muted-foreground">Balanced - Good performance, moderate cost</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evaluations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Evaluation System
              </CardTitle>
              <CardDescription>Evaluates products and companies for scoring</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="evaluations_system_prompt">System Prompt</Label>
                <Textarea
                  id="evaluations_system_prompt"
                  value={config.evaluations_system_prompt || ''}
                  onChange={(e) => updateConfigValue('evaluations_system_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="evaluations_user_prompt">User Prompt</Label>
                <Textarea
                  id="evaluations_user_prompt"
                  value={config.evaluations_user_prompt || ''}
                  onChange={(e) => updateConfigValue('evaluations_user_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="get_evaluations_model">Model</Label>
                  <Input
                    id="get_evaluations_model"
                    value={config.get_evaluations_model || ''}
                    onChange={(e) => updateConfigValue('get_evaluations_model', e.target.value)}
                    placeholder="e.g., gpt-5-2025-08-07, gpt-4.1-2025-04-14"
                  />
                </div>

                <div>
                  <Label htmlFor="get_evaluations_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.get_evaluations_reasoning_effort || 'low'}
                    onValueChange={(value) => updateConfigValue('get_evaluations_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="get_evaluations_verbosity">Verbosity</Label>
                  <Select
                    value={config.get_evaluations_verbosity || 'low'}
                    onValueChange={(value) => updateConfigValue('get_evaluations_verbosity', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select verbosity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-product-completion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Product Completion
              </CardTitle>
              <CardDescription>Configure AI parameters for automatic product information completion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ai_product_completion_system_prompt">System Prompt</Label>
                <Textarea
                  id="ai_product_completion_system_prompt"
                  value={config.ai_product_completion_system_prompt || ''}
                  onChange={(e) => updateConfigValue('ai_product_completion_system_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="System prompt for AI product completion..."
                />
              </div>
              
              <div>
                <Label htmlFor="ai_product_completion_user_prompt">User Prompt</Label>
                <Textarea
                  id="ai_product_completion_user_prompt"
                  value={config.ai_product_completion_user_prompt || ''}
                  onChange={(e) => updateConfigValue('ai_product_completion_user_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="User prompt template for AI product completion..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ai_product_completion_model">Model</Label>
                  <Input
                    id="ai_product_completion_model"
                    value={config.ai_product_completion_model || ''}
                    onChange={(e) => updateConfigValue('ai_product_completion_model', e.target.value)}
                    placeholder="e.g., gpt-4o, gpt-4o-mini, claude-3-sonnet"
                  />
                </div>

                <div>
                  <Label htmlFor="ai_product_completion_max_tokens">Max Tokens</Label>
                  <Input
                    id="ai_product_completion_max_tokens"
                    type="number"
                    min="100"
                    max="10000"
                    value={config.ai_product_completion_max_tokens || 2000}
                    onChange={(e) => updateConfigValue('ai_product_completion_max_tokens', parseInt(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="ai_product_completion_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.ai_product_completion_reasoning_effort || 'medium'}
                    onValueChange={(value) => updateConfigValue('ai_product_completion_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ai_product_completion_verbosity">Verbosity</Label>
                  <Input
                    id="ai_product_completion_verbosity"
                    value={config.ai_product_completion_verbosity || ''}
                    onChange={(e) => updateConfigValue('ai_product_completion_verbosity', e.target.value)}
                    placeholder="e.g., 1, 2, 3"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="ai_product_completion_language">Language</Label>
                <Input
                  id="ai_product_completion_language"
                  value={config.ai_product_completion_language || ''}
                  onChange={(e) => updateConfigValue('ai_product_completion_language', e.target.value)}
                  placeholder="e.g., en, es, fr, de"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="ai-company-completion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Company Completion
              </CardTitle>
              <CardDescription>Configure AI parameters for automatic company information completion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ai_company_completion_system_prompt">System Prompt</Label>
                <Textarea
                  id="ai_company_completion_system_prompt"
                  value={config.ai_company_completion_system_prompt || ''}
                  onChange={(e) => updateConfigValue('ai_company_completion_system_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="System prompt for AI company completion..."
                />
              </div>
              
              <div>
                <Label htmlFor="ai_company_completion_user_prompt">User Prompt</Label>
                <Textarea
                  id="ai_company_completion_user_prompt"
                  value={config.ai_company_completion_user_prompt || ''}
                  onChange={(e) => updateConfigValue('ai_company_completion_user_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="User prompt template for AI company completion..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ai_company_completion_model">Model</Label>
                  <Input
                    id="ai_company_completion_model"
                    value={config.ai_company_completion_model || ''}
                    onChange={(e) => updateConfigValue('ai_company_completion_model', e.target.value)}
                    placeholder="e.g., gpt-4o, gpt-4o-mini, claude-3-sonnet"
                  />
                </div>

                <div>
                  <Label htmlFor="ai_company_completion_max_tokens">Max Tokens</Label>
                  <Input
                    id="ai_company_completion_max_tokens"
                    type="number"
                    min="100"
                    max="10000"
                    value={config.ai_company_completion_max_tokens || 2000}
                    onChange={(e) => updateConfigValue('ai_company_completion_max_tokens', parseInt(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="ai_company_completion_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.ai_company_completion_reasoning_effort || 'medium'}
                    onValueChange={(value) => updateConfigValue('ai_company_completion_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ai_company_completion_verbosity">Verbosity</Label>
                  <Input
                    id="ai_company_completion_verbosity"
                    value={config.ai_company_completion_verbosity || ''}
                    onChange={(e) => updateConfigValue('ai_company_completion_verbosity', e.target.value)}
                    placeholder="e.g., 1, 2, 3"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="ai_company_completion_language">Language</Label>
                <Input
                  id="ai_company_completion_language"
                  value={config.ai_company_completion_language || ''}
                  onChange={(e) => updateConfigValue('ai_company_completion_language', e.target.value)}
                  placeholder="e.g., en, es, fr, de"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical-info-node" className="space-y-6">
          <LLMGroupExtended
            title="Technical Info Node"
            prefix="technical_info_node"
            description="Provides detailed technical information about products and services"
            promptKey="technical_info_node_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="technical-decision-node" className="space-y-6">
          <LLMGroupExtended
            title="Technical Decision Node"
            prefix="technical_decision_node"
            description="Makes technical decisions based on product specifications and requirements"
            promptKey="technical_decision_node_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="company-info-node" className="space-y-6">
          <LLMGroupExtended
            title="Company Info Node"
            prefix="company_info_node"
            description="Provides detailed company information and business insights"
            promptKey="company_info_node_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="company-decision-node" className="space-y-6">
          <LLMGroupExtended
            title="Company Decision Node"
            prefix="company_decision_node"
            description="Makes business decisions based on company data and market conditions"
            promptKey="company_decision_node_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="evaluation-node" className="space-y-6">
          <LLMGroupExtended
            title="Evaluation Node"
            prefix="evaluation_node"
            description="Evaluates products and services based on technical specifications and market requirements"
            promptKey="evaluation_node_prompt"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="company-evaluation" className="space-y-6">
          <CompanyEvaluationGroup
            title="Company Evaluation"
            prefix="company_evaluation"
            description="Evaluates companies based on their business profile, capabilities, and market position"
            config={config}
            updateConfigValue={updateConfigValue}
          />
        </TabsContent>

        <TabsContent value="rfx-conversational" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                RFX Conversational Agent
              </CardTitle>
              <CardDescription>
                System prompt for the RFX conversational agent used in /ws-rfx-agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="rfx_conversational_system_prompt">System Prompt</Label>
                <Textarea
                  id="rfx_conversational_system_prompt"
                  value={config.rfx_conversational_system_prompt || ''}
                  onChange={(e) => updateConfigValue('rfx_conversational_system_prompt', e.target.value)}
                  rows={16}
                  className="mt-1"
                  placeholder="Enter the system prompt for the RFX conversational agent..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="propose-edits" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Propose Edits Tool
              </CardTitle>
              <CardDescription>
                Configuration for the propose_edits tool used in RFX conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="propose_edits_system_prompt">System Prompt</Label>
                <Textarea
                  id="propose_edits_system_prompt"
                  value={config.propose_edits_system_prompt || ''}
                  onChange={(e) => updateConfigValue('propose_edits_system_prompt', e.target.value)}
                  rows={16}
                  className="mt-1"
                  placeholder="Enter the system prompt for the propose_edits tool..."
                />
              </div>
              
              <div>
                <Label htmlFor="propose_edits_default_language">Default Language</Label>
                <Input
                  id="propose_edits_default_language"
                  value={config.propose_edits_default_language || ''}
                  onChange={(e) => updateConfigValue('propose_edits_default_language', e.target.value)}
                  placeholder="e.g., English, Spanish, French, German"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Default language hint for propose_edits tool (e.g., "English", "Spanish")
                </p>
              </div>
              
              <Separator />
              
              <div>
                <Label htmlFor="propose_edits_user_prompt">User Prompt (Read-only)</Label>
                <Textarea
                  id="propose_edits_user_prompt"
                  value={`{
  "instructions": {
    "task": "Make specific proposals in JSON Patch (RFC-6902)",
    "focus": focus_text,
    "max_suggestions": 1,
    "goal": goal,
    "markdown": "True",
    "language": default_language
  },
  "current_state": {
    "description": current_state.get("description", ""),
    "technical_specifications": current_state.get("technical_specifications", ""),
    "company_requirements": current_state.get("company_requirements", "")
  },
  "expected_output": "Return only valid JSON, without additional text."
}`}
                  rows={20}
                  className="mt-1 font-mono text-sm"
                  disabled
                  readOnly
                />
                <p className="text-sm text-muted-foreground mt-1">
                  This is the user prompt structure used by the propose_edits tool. Variables like focus_text, goal, default_language, and current_state are dynamically populated at runtime.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rfx-analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                RFX Analysis Agent
              </CardTitle>
              <CardDescription>
                Configuration for the RFX analysis agent used in /ws-rfx-analysis to analyze supplier responses and documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="rfx_analysis_system_prompt">System Prompt</Label>
                <Textarea
                  id="rfx_analysis_system_prompt"
                  value={config.rfx_analysis_system_prompt || ''}
                  onChange={(e) => updateConfigValue('rfx_analysis_system_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="System prompt for RFX analysis..."
                />
              </div>
              
              <div>
                <Label htmlFor="rfx_analysis_user_prompt">User Prompt</Label>
                <Textarea
                  id="rfx_analysis_user_prompt"
                  value={config.rfx_analysis_user_prompt || ''}
                  onChange={(e) => updateConfigValue('rfx_analysis_user_prompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="User prompt template for RFX analysis..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rfx_analysis_model">Model</Label>
                  <Input
                    id="rfx_analysis_model"
                    value={config.rfx_analysis_model || ''}
                    onChange={(e) => updateConfigValue('rfx_analysis_model', e.target.value)}
                    placeholder="e.g., gpt-5-2025-08-07, gpt-4o"
                  />
                </div>

                <div>
                  <Label htmlFor="rfx_analysis_reasoning_effort">Reasoning Effort</Label>
                  <Select
                    value={config.rfx_analysis_reasoning_effort || 'medium'}
                    onValueChange={(value) => updateConfigValue('rfx_analysis_reasoning_effort', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="rfx_analysis_verbosity">Verbosity</Label>
                  <Select
                    value={config.rfx_analysis_verbosity || 'medium'}
                    onValueChange={(value) => updateConfigValue('rfx_analysis_verbosity', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select verbosity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Save Configuration
          </CardTitle>
          <CardDescription>
            Save the current configuration with a descriptive comment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="save-comment">Comment (required)</Label>
            <Textarea
              id="save-comment"
              value={saveComment}
              onChange={(e) => setSaveComment(e.target.value)}
              placeholder="Describe the changes made..."
              rows={3}
            />
          </div>
          <Button onClick={handleSave} disabled={loading || !saveComment.trim()}>
            {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Configuration History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Configuration History
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBackups(!showBackups)}
            >
              {showBackups ? 'Hide' : 'Show'} History
            </Button>
          </CardTitle>
          <CardDescription>
            Load previous configurations or view change history
          </CardDescription>
        </CardHeader>
        {showBackups && !loading && (
          <CardContent>
            <div className="space-y-3">
              {backups.length > 0 ? (
                backups.map((backup) => {
                  const isActive = isActiveConfig(backup);
                  return (
                    <div key={backup.id} className={`flex items-center justify-between p-3 border rounded-lg ${isActive ? 'border-green-500 bg-green-50' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">
                            <User className="h-3 w-3 mr-1" />
                            {backup.created_by}
                          </Badge>
                          {isActive && (
                            <Badge variant="default" className="bg-green-600">
                              Currently Active
                            </Badge>
                          )}
                          <span className="text-sm text-gray-500">
                            {new Date(backup.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm">{backup.comment || 'No comment provided'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadBackup(backup)}
                        disabled={isActive}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {isActive ? 'Active' : 'Load'}
                      </Button>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">No configuration history available</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg flex items-center gap-3">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Loading configuration...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;