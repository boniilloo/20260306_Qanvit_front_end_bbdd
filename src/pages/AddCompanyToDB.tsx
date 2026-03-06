import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function AddCompanyToDB() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be authenticated to submit a request",
        variant: "destructive",
      });
      return;
    }

    if (!url.trim()) {
      toast({
        title: "Error", 
        description: "URL is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('company_requests')
        .insert({
          user_id: user.id,
          url: url.trim(),
          comment: comment.trim() || null,
        });

      if (error) {
        console.error('Error inserting company request:', error);
        toast({
          title: "Error",
          description: "Could not submit the request. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Request submitted",
        description: "Your request to add the company has been submitted successfully.",
      });

      // Reset form
      setUrl('');
      setComment('');
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "Unexpected error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-foreground">Add Company to DB</h1>
        <p className="text-muted-foreground mt-2">
          Request to add a new company to our database
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Company Request</CardTitle>
          <CardDescription>
            Provide the URL of the company you want us to add to our database.
            We will review your request and process the company information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Company URL *</Label>
              <Input
                id="url"
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Textarea
                id="comment"
                placeholder="Add any additional information about this company..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                disabled={isLoading}
              />
            </div>

            <Button 
              type="submit" 
              disabled={isLoading || !url.trim()}
              className="w-full"
            >
              {isLoading ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}