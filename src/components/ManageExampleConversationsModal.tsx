import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Star, 
  Trash2, 
  Edit2, 
  Plus, 
  Save, 
  X, 
  Eye,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import { usePublicConversations, PublicConversation } from '@/hooks/usePublicConversations';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import PublicConversationImageUpload from './PublicConversationImageUpload';

interface ManageExampleConversationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditingConversation {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  is_featured: boolean;
  display_order: number;
  image_url: string | null;
}

const ManageExampleConversationsModal: React.FC<ManageExampleConversationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { publicConversations, loading, updatePublicConversation, removeFromPublic, refresh } = usePublicConversations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditingConversation | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newConversationId, setNewConversationId] = useState('');

  const handleEdit = (pc: PublicConversation) => {
    setEditingId(pc.id);
    setEditForm({
      id: pc.id,
      title: pc.title || pc.conversation?.preview || '',
      description: pc.description || '',
      category: pc.category || '',
      tags: pc.tags?.join(', ') || '',
      is_featured: pc.is_featured,
      display_order: pc.display_order,
      image_url: pc.image_url,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;

    await updatePublicConversation(editForm.id, {
      title: editForm.title || null,
      description: editForm.description || null,
      category: editForm.category || null,
      tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(t => t) : null,
      is_featured: editForm.is_featured,
      display_order: editForm.display_order,
      image_url: editForm.image_url,
    });

    setEditingId(null);
    setEditForm(null);
  };

  const handleRemove = async (id: string) => {
    if (confirm('Are you sure you want to remove this conversation from public examples?')) {
      await removeFromPublic(id);
    }
  };

  const handleAddNew = () => {
    setAddingNew(true);
  };

  const handleAddNewSubmit = async () => {
    if (!newConversationId.trim()) {
      alert('Please enter a conversation ID');
      return;
    }

    // We'll implement this in a separate hook
    // For now, just show a message
    alert('To add a new public conversation, use the "Make Public" button from the conversation viewer');
    setAddingNew(false);
    setNewConversationId('');
  };

  const moveUp = async (pc: PublicConversation) => {
    const newOrder = Math.max(0, pc.display_order - 1);
    await updatePublicConversation(pc.id, { display_order: newOrder });
  };

  const moveDown = async (pc: PublicConversation) => {
    const newOrder = pc.display_order + 1;
    await updatePublicConversation(pc.id, { display_order: newOrder });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Manage Example Conversations</span>
            <Badge variant="secondary">{publicConversations.length} public</Badge>
          </DialogTitle>
          <DialogDescription>
            Manage which conversations are shown as public examples to all users
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading public conversations...
              </div>
            ) : publicConversations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No public conversations yet</p>
                <p className="text-sm text-muted-foreground">
                  Go to a conversation and mark it as public to add it here
                </p>
              </div>
            ) : (
              publicConversations.map((pc) => (
                <Card key={pc.id} className={pc.is_featured ? 'border-primary' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          {pc.is_featured && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          <CardTitle className="text-base">
                            {pc.title || pc.conversation?.preview || 'Untitled Conversation'}
                          </CardTitle>
                        </div>
                        {pc.category && (
                          <Badge variant="outline" className="text-xs">
                            {pc.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveUp(pc)}
                          disabled={pc.display_order === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveDown(pc)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(pc)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(pc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {editingId === pc.id && editForm ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="title">Title</Label>
                          <Input
                            id="title"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="Custom title for this example"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Describe what this example demonstrates"
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <Input
                              id="category"
                              value={editForm.category}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              placeholder="e.g., product_search"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="display_order">Display Order</Label>
                            <Input
                              id="display_order"
                              type="number"
                              value={editForm.display_order}
                              onChange={(e) => setEditForm({ ...editForm, display_order: parseInt(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        {/* Image Upload Section */}
                        <PublicConversationImageUpload
                          conversationId={pc.conversation_id}
                          currentImageUrl={editForm.image_url}
                          onImageUploaded={(imageUrl) => setEditForm({ ...editForm, image_url: imageUrl })}
                          onImageRemoved={() => setEditForm({ ...editForm, image_url: null })}
                        />

                        <div className="space-y-2">
                          <Label htmlFor="tags">Tags (comma-separated)</Label>
                          <Input
                            id="tags"
                            value={editForm.tags}
                            onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                            placeholder="tag1, tag2, tag3"
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="is_featured"
                            checked={editForm.is_featured}
                            onCheckedChange={(checked) => setEditForm({ ...editForm, is_featured: checked })}
                          />
                          <Label htmlFor="is_featured">Featured Example</Label>
                        </div>

                        <div className="flex space-x-2">
                          <Button onClick={handleSaveEdit} size="sm">
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </Button>
                          <Button onClick={handleCancelEdit} variant="outline" size="sm">
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pc.description && (
                          <p className="text-sm text-muted-foreground">{pc.description}</p>
                        )}
                        
                        {pc.tags && pc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {pc.tags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center space-x-4 text-xs text-muted-foreground pt-2">
                          <div className="flex items-center space-x-1">
                            <Eye className="h-3 w-3" />
                            <span>{pc.view_count} views</span>
                          </div>
                          <div>Order: {pc.display_order}</div>
                          <div>ID: {pc.conversation_id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            💡 Tip: Open a conversation and use "Make Public" to add it here
          </p>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageExampleConversationsModal;

