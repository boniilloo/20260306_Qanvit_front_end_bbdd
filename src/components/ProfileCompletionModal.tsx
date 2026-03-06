import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProfileCompletionModalProps {
  isOpen: boolean;
  userId: string;
  currentData: {
    name?: string | null;
    surname?: string | null;
    company_position?: string | null;
    company_id?: string | null;
  };
  onComplete: () => void;
}

const ProfileCompletionModal = ({ isOpen, userId, currentData, onComplete }: ProfileCompletionModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: currentData.name || '',
    surname: currentData.surname || '',
    company_position: currentData.company_position || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.surname.trim() || !formData.company_position.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('app_user')
        .update({
          name: formData.name.trim(),
          surname: formData.surname.trim(),
          company_position: formData.company_position.trim(),
        })
        .eq('auth_user_id', userId);

      if (error) {
        throw error;
      }

      toast({
        title: "Profile updated",
        description: "Your profile has been completed successfully.",
      });

      // Add a small delay to ensure database consistency before calling onComplete
      setTimeout(() => {
        onComplete();
      }, 100);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Complete Your Profile</DialogTitle>
          <DialogDescription>
            Please provide your name, surname, and company position to continue using the application.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="surname">Surname *</Label>
            <Input
              id="surname"
              type="text"
              placeholder="Enter your surname"
              value={formData.surname}
              onChange={(e) => setFormData(prev => ({ ...prev, surname: e.target.value }))}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="company_position">Company Position *</Label>
            <Input
              id="company_position"
              type="text"
              placeholder="Enter your company position"
              value={formData.company_position}
              onChange={(e) => setFormData(prev => ({ ...prev, company_position: e.target.value }))}
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Save and Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileCompletionModal;