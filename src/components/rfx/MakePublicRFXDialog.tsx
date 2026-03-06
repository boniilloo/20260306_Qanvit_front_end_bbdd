import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Loader2 } from 'lucide-react';
import { usePublicRFXs } from '@/hooks/usePublicRFXs';
import PublicRFXImageUpload from './PublicRFXImageUpload';

interface MakePublicRFXDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rfxId: string;
  rfxName: string;
  rfxDescription?: string | null;
}

const MakePublicRFXDialog: React.FC<MakePublicRFXDialogProps> = ({
  isOpen,
  onClose,
  rfxId,
  rfxName,
  rfxDescription,
}) => {
  const { makePublic, publicRfxs, removeFromPublic } = usePublicRFXs();
  const [loading, setLoading] = useState(false);
  const [isAlreadyPublic, setIsAlreadyPublic] = useState(false);
  const [publicRfxId, setPublicRfxId] = useState<string | null>(null);

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
    const publicEntry = publicRfxs.find((pr) => pr.rfx_id === rfxId);
    setIsAlreadyPublic(!!publicEntry);
    setPublicRfxId(publicEntry?.id || null);

    if (isOpen) {
      setFormData({
        title: publicEntry?.title || rfxName || '',
        description: publicEntry?.description || rfxDescription || '',
        category: publicEntry?.category || '',
        tags: publicEntry?.tags?.join(', ') || '',
        is_featured: publicEntry?.is_featured ?? false,
        display_order: publicEntry?.display_order ?? 0,
      });
      setImageUrl(publicEntry?.image_url || null);
    }
  }, [isOpen, rfxId, rfxName, rfxDescription, publicRfxs]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await makePublic(rfxId, {
        title: formData.title || undefined,
        description: formData.description || undefined,
        category: formData.category || undefined,
        tags: formData.tags
          ? formData.tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t)
          : undefined,
        is_featured: formData.is_featured,
        display_order: formData.display_order,
        image_url: imageUrl || undefined,
      });
      onClose();
    } catch (error) {
      // Error already handled in hook
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromPublic = async () => {
    if (!publicRfxId) return;

    if (confirm('Are you sure you want to remove this RFX from public examples?')) {
      setLoading(true);
      try {
        await removeFromPublic(publicRfxId);
        onClose();
      } catch (error) {
        // Error already handled in hook
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
            <span>{isAlreadyPublic ? 'Public RFX Example' : 'Make RFX Public Example'}</span>
          </DialogTitle>
          <DialogDescription>
            {isAlreadyPublic
              ? 'This RFX is already a public example. You can remove it from public examples.'
              : 'Make this RFX available as a public example for all users to view.'}
          </DialogDescription>
        </DialogHeader>

        {isAlreadyPublic ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-900">This RFX is public</span>
              </div>
              <p className="text-sm text-green-700">
                This RFX is currently visible to all users as an example.
              </p>
            </div>

            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-semibold">Title:</span>{' '}
                {formData.title || rfxName}
              </p>
              {formData.description && (
                <p className="line-clamp-3">
                  <span className="font-semibold">Description:</span>{' '}
                  {formData.description}
                </p>
              )}
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
                placeholder={rfxName || 'Title for this RFX example'}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the RFX name.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this RFX example demonstrates..."
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
                  placeholder="e.g., vision_system, packaging"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      display_order: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="RFX, example, demo"
              />
            </div>

            {/* Image Upload Section */}
            <PublicRFXImageUpload
              rfxId={rfxId}
              currentImageUrl={imageUrl || undefined}
              onImageUploaded={setImageUrl}
              onImageRemoved={() => setImageUrl(null)}
            />

            <div className="flex items-center space-x-2">
              <Switch
                id="is_featured"
                checked={formData.is_featured}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_featured: checked })
                }
              />
              <Label htmlFor="is_featured">Mark as Featured RFX Example</Label>
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

export default MakePublicRFXDialog;


