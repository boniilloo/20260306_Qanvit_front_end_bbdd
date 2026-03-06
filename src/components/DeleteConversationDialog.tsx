
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Archive, Trash2 } from 'lucide-react';

interface DeleteConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  onArchive: () => void;
  conversationTitle: string;
  hasRFX: boolean;
}

const DeleteConversationDialog = ({ 
  isOpen, 
  onClose, 
  onDelete, 
  onArchive, 
  conversationTitle, 
  hasRFX 
}: DeleteConversationDialogProps) => {
  if (!hasRFX) {
    // Regular delete confirmation for conversations without RFX
    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{conversationTitle}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={onDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 size={16} className="mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Special dialog for conversations that were saved as RFX
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-600">⚠️ RFX Conversation</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You created an RFX from this conversation: <strong>"{conversationTitle}"</strong>
            </p>
            <p className="text-sm text-gray-600">
              We recommend <strong>archiving</strong> this conversation to keep it accessible from your RFX project page while removing it from the navigation menu.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onArchive}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            <Archive size={16} className="mr-2" />
            Archive Conversation
          </AlertDialogAction>
          <AlertDialogAction 
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
          >
            <Trash2 size={16} className="mr-2" />
            Delete Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConversationDialog;
