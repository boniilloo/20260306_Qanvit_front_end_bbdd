import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

interface ScrapperSettings {
  id?: number;
  prompt_products2_user?: string;
  prompt_company_system?: string;
  prompt_company_user?: string;
  prompt_products1_system?: string;
  prompt_products1_user?: string;
  prompt_products2_system?: string;
}

const ScrapperSettingsTab = () => {
  const [settings, setSettings] = useState<ScrapperSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('prompts_webscrapping')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading settings:', error);
        toast({
          title: "Error",
          description: "Failed to load scrapper settings",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error",
        description: "Failed to load scrapper settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof ScrapperSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let result;
      
      if (settings.id) {
        // Update existing record
        result = await supabase
          .from('prompts_webscrapping')
          .update(settings)
          .eq('id', settings.id);
      } else {
        // Insert new record
        result = await supabase
          .from('prompts_webscrapping')
          .insert([settings])
          .select()
          .single();
      }

      if (result.error) {
        console.error('Error saving settings:', result.error);
        toast({
          title: "Error",
          description: "Failed to save scrapper settings",
          variant: "destructive",
        });
        return;
      }

      if (!settings.id && result.data) {
        setSettings(result.data);
      }

      toast({
        title: "Success",
        description: "Scrapper settings saved successfully",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save scrapper settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Scrapper Settings</h2>
        <p className="text-muted-foreground">Configure prompts for web scrapping</p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="company">Company Prompts</TabsTrigger>
          <TabsTrigger value="products1">Products 1</TabsTrigger>
          <TabsTrigger value="products2">Products 2</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Prompts</CardTitle>
              <CardDescription>Configure prompts for company information extraction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt_company_system">System Prompt</Label>
                <Textarea
                  id="prompt_company_system"
                  placeholder="Enter the system prompt for company information extraction..."
                  value={settings.prompt_company_system || ''}
                  onChange={(e) => handleInputChange('prompt_company_system', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt_company_user">User Prompt</Label>
                <Textarea
                  id="prompt_company_user"
                  placeholder="Enter the user prompt for company information extraction..."
                  value={settings.prompt_company_user || ''}
                  onChange={(e) => handleInputChange('prompt_company_user', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products1" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Products 1 Prompts</CardTitle>
              <CardDescription>Configure the first set of prompts for product information extraction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt_products1_system">System Prompt</Label>
                <Textarea
                  id="prompt_products1_system"
                  placeholder="Enter the first system prompt for product information extraction..."
                  value={settings.prompt_products1_system || ''}
                  onChange={(e) => handleInputChange('prompt_products1_system', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt_products1_user">User Prompt</Label>
                <Textarea
                  id="prompt_products1_user"
                  placeholder="Enter the first user prompt for product information extraction..."
                  value={settings.prompt_products1_user || ''}
                  onChange={(e) => handleInputChange('prompt_products1_user', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products2" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Products 2 Prompts</CardTitle>
              <CardDescription>Configure the second set of prompts for product information extraction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt_products2_system">System Prompt</Label>
                <Textarea
                  id="prompt_products2_system"
                  placeholder="Enter the second system prompt for product information extraction..."
                  value={settings.prompt_products2_system || ''}
                  onChange={(e) => handleInputChange('prompt_products2_system', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt_products2_user">User Prompt</Label>
                <Textarea
                  id="prompt_products2_user"
                  placeholder="Enter the second user prompt for product information extraction..."
                  value={settings.prompt_products2_user || ''}
                  onChange={(e) => handleInputChange('prompt_products2_user', e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Save Button - Fixed position */}
        <div className="flex justify-end mt-6">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            size="lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </Tabs>
    </div>
  );
};

export default ScrapperSettingsTab;