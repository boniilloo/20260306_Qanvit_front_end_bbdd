import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Loader2 } from 'lucide-react';
import { usePublicConversations } from '@/hooks/usePublicConversations';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import PublicConversationImageUpload from './PublicConversationImageUpload';

interface MakePublicConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationPreview?: string;
}

const MakePublicConversationDialog: React.FC<MakePublicConversationDialogProps> = ({
  isOpen,
  onClose,
  conversationId,
  conversationPreview,
}) => {
  const { makePublic, publicConversations, removeFromPublic } = usePublicConversations();
  const [loading, setLoading] = useState(false);
  const [isAlreadyPublic, setIsAlreadyPublic] = useState(false);
  const [publicConversationId, setPublicConversationId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
    is_featured: false,
    display_order: 0,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check if conversation is already public
    const publicConv = publicConversations.find(pc => pc.conversation_id === conversationId);
    setIsAlreadyPublic(!!publicConv);
    setPublicConversationId(publicConv?.id || null);

    // Reset form when opening
    if (isOpen) {
      setFormData({
        title: conversationPreview || '',
        description: '',
        category: '',
        tags: '',
        is_featured: false,
        display_order: 0,
      });
    }
  }, [conversationId, publicConversations, isOpen, conversationPreview]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await makePublic(conversationId, {
        title: formData.title || undefined,
        description: formData.description || undefined,
        category: formData.category || undefined,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : undefined,
        is_featured: formData.is_featured,
        display_order: formData.display_order,
        image_url: imageUrl || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Error making conversation public:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromPublic = async () => {
    if (!publicConversationId) return;
    
    if (confirm('Are you sure you want to remove this conversation from public examples?')) {
      setLoading(true);
      try {
        await removeFromPublic(publicConversationId);
        onClose();
      } catch (error) {
        console.error('Error removing from public:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>{isAlreadyPublic ? 'Public Example' : 'Make Public Example'}</span>
          </DialogTitle>
          <DialogDescription>
            {isAlreadyPublic
              ? 'This conversation is already a public example. You can remove it from public examples.'
              : 'Make this conversation available as a public example for all users to view'}
          </DialogDescription>
        </DialogHeader>

        {isAlreadyPublic ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-900">This conversation is public</span>
              </div>
              <p className="text-sm text-green-700">
                This conversation is currently visible to all users as an example.
                Go to "Manage Example Conversations" to edit its details.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title (Optional)</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={conversationPreview || 'Title for this example'}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the conversation preview
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this example demonstrates..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., product_search"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Image Upload Section */}
            <PublicConversationImageUpload
              conversationId={conversationId}
              currentImageUrl={imageUrl}
              onImageUploaded={setImageUrl}
              onImageRemoved={() => setImageUrl(null)}
            />

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="example, demo, featured"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_featured"
                checked={formData.is_featured}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
              <Label htmlFor="is_featured">Mark as Featured Example</Label>
            </div>
          </div>
        )}

        <DialogFooter>
          {isAlreadyPublic ? (
            <>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
              <Button
                onClick={handleRemoveFromPublic}
                variant="destructive"
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Remove from Public
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose} variant="outline" disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Sparkles className="h-4 w-4 mr-2" />
                Make Public
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MakePublicConversationDialog;

