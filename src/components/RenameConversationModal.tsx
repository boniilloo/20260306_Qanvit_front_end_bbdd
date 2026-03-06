
import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RenameConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
  initialTitle?: string;
}

const RenameConversationModal: React.FC<RenameConversationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTitle = '',
}) => {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Focus the input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    // Reset title when modal opens with new initialTitle
    setTitle(initialTitle);
  }, [isOpen, initialTitle]);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle) {
      onSave(trimmedTitle.substring(0, 60)); // Limit to 60 characters
    } else if (!trimmedTitle && initialTitle === 'New conversation') {
      // For new conversations with empty title, we'll use default in the parent
      onSave('');
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Name this conversation</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl"
            placeholder="Enter a title for this conversation"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground mt-2">Max 60 characters.</p>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            className="mr-2"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            className="bg-[#00B3A4] hover:bg-[#008F83] text-white"
          >
            Save title
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameConversationModal;
