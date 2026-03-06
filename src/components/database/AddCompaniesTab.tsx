import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus } from 'lucide-react';

const AddCompaniesTab = () => {
  const [urls, setUrls] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAddCompanies = async () => {
    if (!urls.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Parse URLs - split by spaces or newlines and filter out empty strings
      const urlList = urls
        .split(/\s+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);

      if (urlList.length === 0) {
        toast({
          title: "Error",
          description: "No valid URLs found",
          variant: "destructive",
        });
        return;
      }

      // Validate URLs
      const validUrls = [];
      const invalidUrls = [];

      for (const url of urlList) {
        try {
          new URL(url);
          validUrls.push(url);
        } catch {
          invalidUrls.push(url);
        }
      }

      if (invalidUrls.length > 0) {
        toast({
          title: "Warning",
          description: `${invalidUrls.length} invalid URLs were skipped`,
          variant: "destructive",
        });
      }

      if (validUrls.length === 0) {
        toast({
          title: "Error",
          description: "No valid URLs to add",
          variant: "destructive",
        });
        return;
      }

      // Check for existing URLs to avoid duplicates - process in batches
      const existingUrls = [];
      const batchSize = 50; // Supabase limit for IN operator
      
      for (let i = 0; i < validUrls.length; i += batchSize) {
        const batch = validUrls.slice(i, i + batchSize);
        const { data: existingBatch, error: fetchError } = await supabase
          .from('company')
          .select('url_root')
          .in('url_root', batch);

        if (fetchError) {
          console.error('Error checking existing companies:', fetchError);
          toast({
            title: "Error",
            description: "Failed to check for existing companies",
            variant: "destructive",
          });
          return;
        }

        if (existingBatch) {
          existingUrls.push(...existingBatch.map(company => company.url_root));
        }
      }
      const newUrls = validUrls.filter(url => !existingUrls.includes(url));
      const duplicateUrls = validUrls.filter(url => existingUrls.includes(url));

      if (duplicateUrls.length > 0) {
        toast({
          title: "Duplicates found",
          description: `${duplicateUrls.length} URLs already exist and were skipped`,
          variant: "default",
        });
      }

      if (newUrls.length === 0) {
        toast({
          title: "No new companies",
          description: "All URLs already exist in the database",
          variant: "default",
        });
        setUrls('');
        return;
      }

      // Insert only new companies into database
      const companies = newUrls.map(url => ({
        url_root: url,
        role: 'supplier'
      }));

      const { error } = await supabase
        .from('company')
        .insert(companies);

      if (error) {
        console.error('Error adding companies:', error);
        toast({
          title: "Error",
          description: "Failed to add companies to database",
          variant: "destructive",
        });
        return;
      }

      const successMessage = duplicateUrls.length > 0 
        ? `Successfully added ${newUrls.length} new companies (${duplicateUrls.length} duplicates skipped)`
        : `Successfully added ${newUrls.length} companies`;

      toast({
        title: "Success",
        description: successMessage,
      });

      // Clear the textarea
      setUrls('');

    } catch (error) {
      console.error('Error processing URLs:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Companies
          </CardTitle>
          <CardDescription>
            Add multiple company URLs to the database. Each URL will be added as a supplier company.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="urls" className="text-sm font-medium">
              Company URLs
            </label>
            <Textarea
              id="urls"
              placeholder="Enter URLs separated by spaces or new lines:&#10;https://www.example1.com https://www.example2.com&#10;https://www.example3.com"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter URLs separated by spaces or new lines. Invalid URLs will be skipped.
            </p>
          </div>

          <Button 
            onClick={handleAddCompanies} 
            disabled={isLoading || !urls.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding Companies...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Companies
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddCompaniesTab;