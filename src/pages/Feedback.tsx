import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Heart, Lightbulb } from 'lucide-react';
import { FeedbackThankYouModal } from '@/components/FeedbackThankYouModal';
const Feedback = () => {
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const {
    toast
  } = useToast();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      toast({
        title: "Please enter your feedback",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from('user_feedback').insert([{
        feedback_text: feedback.trim(),
        category: category || null,
        user_id: (await supabase.auth.getUser()).data.user?.id
      }]);
      if (error) throw error;
      
      setFeedback('');
      setCategory('');
      setShowThankYouModal(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error submitting feedback",
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  return <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-4">Your Feedback Matters</h1>
            
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="text-center">
              <CardHeader>
                <Heart className="h-6 w-6 text-red-500 mx-auto mb-2" />
                <CardTitle className="text-lg">We Value Your Voice</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Every comment and suggestion is carefully reviewed by our team
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Lightbulb className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                <CardTitle className="text-lg">Drive Innovation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Your ideas help shape new features and improvements
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <MessageCircle className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <CardTitle className="text-lg">Open Communication</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We believe in transparent dialogue with our users
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Feedback Form */}
          <Card>
            <CardHeader>
              <CardTitle>Share Your Feedback</CardTitle>
              <CardDescription>
                Tell us about your experience, suggest improvements, or share any ideas you have
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Category (Optional)
                  </label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Feedback</SelectItem>
                      <SelectItem value="feature-request">Feature Request</SelectItem>
                      <SelectItem value="bug-report">Bug Report</SelectItem>
                      <SelectItem value="user-experience">User Experience</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="feedback" className="text-sm font-medium mb-2 block">
                    Your Feedback *
                  </label>
                  <Textarea id="feedback" placeholder="Share your thoughts, suggestions, or ideas here..." value={feedback} onChange={e => setFeedback(e.target.value)} className="min-h-[120px]" required />
                </div>

                <Button type="submit" disabled={isSubmitting || !feedback.trim()} className="w-full">
                  {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Thank you for taking the time to help us improve Qanvit. 
            </p>
          </div>
        </div>
      </div>
      
      <FeedbackThankYouModal 
        isOpen={showThankYouModal}
        onClose={() => setShowThankYouModal(false)}
      />
    </div>;
};
export default Feedback;