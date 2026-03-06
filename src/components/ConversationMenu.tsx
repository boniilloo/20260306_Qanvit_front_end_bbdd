
import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Share, FileText } from 'lucide-react';
import RenameConversationModal from './RenameConversationModal';
import DeleteConversationDialog from './DeleteConversationDialog';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface ConversationMenuProps {
  conversationId: string;
  conversationTitle: string;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
}

const ConversationMenu = ({ conversationId, conversationTitle, onDelete, onRename }: ConversationMenuProps) => {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();

  // Check if this conversation was saved as an RFX
  const checkIfConversationHasRFX = () => {
    const savedRFXs = localStorage.getItem('fq-rfx-projects');
    if (savedRFXs) {
      const rfxs = JSON.parse(savedRFXs);
      return rfxs.some((rfx: any) => rfx.conversationId === conversationId);
    }
    return false;
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/chat/${conversationId}`);
      toast({
        title: "Link copied",
        description: "Conversation link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive",
      });
    }
  };

  const handleSaveAsRFX = () => {
    // Check if RFX already exists for this conversation
    if (checkIfConversationHasRFX()) {
      toast({
        title: "RFX Already Exists",
        description: "An RFX has already been created from this conversation",
        variant: "destructive",
      });
      return;
    }

    // Get conversation messages from localStorage
    const savedMessages = localStorage.getItem(`fq-conversation-${conversationId}`);
    
    if (!savedMessages) {
      // If no saved messages, try to get from current conversation state
      
    }

    let lastAssistantMessage = '';
    if (savedMessages) {
      try {
        const messages = JSON.parse(savedMessages);
        const assistantMessage = messages
          .filter((msg: any) => msg.role === 'assistant')
          .pop();
        lastAssistantMessage = assistantMessage?.content || '';
      } catch (error) {
        console.error('Error parsing saved messages:', error);
      }
    }

    // Create RFX data from the conversation using the conversation title
    const rfxData = {
      id: Date.now().toString(),
      name: conversationTitle || 'Untitled RFX',
      description: lastAssistantMessage || 'RFX created from conversation',
      status: 'Open',
      supplierCount: 0,
      lastUpdated: 'Just now',
      specifications: [],
      questions: [],
      suppliers: [],
      createdAt: new Date().toISOString(),
      conversationId: conversationId // Link to the conversation
    };

    // Save to localStorage
    const existingRFXs = localStorage.getItem('fq-rfx-projects');
    const rfxs = existingRFXs ? JSON.parse(existingRFXs) : [];
    const updatedRFXs = [rfxData, ...rfxs];
    localStorage.setItem('fq-rfx-projects', JSON.stringify(updatedRFXs));

    toast({
      title: "RFX Created Successfully",
      description: `"${conversationTitle || 'Untitled RFX'}" has been saved as an RFX project`,
    });

    // Navigate to RFX Projects page
    navigate('/rfxs');
  };

  const handleRename = (newTitle: string) => {
    onRename(conversationId, newTitle);
    setIsRenameModalOpen(false);
  };

  const handleArchiveConversation = () => {
    // Archive the conversation (mark as archived in localStorage)
    const savedConversations = localStorage.getItem('fq-conversations');
    if (savedConversations) {
      const conversations = JSON.parse(savedConversations);
      const updatedConversations = conversations.map((conv: any) =>
        conv.id === conversationId ? { ...conv, archived: true } : conv
      );
      localStorage.setItem('fq-conversations', JSON.stringify(updatedConversations));
    }

    // Remove from sidebar but keep accessible from RFX
    onDelete(conversationId);
    setIsDeleteDialogOpen(false);

    toast({
      title: "Conversation Archived",
      description: "The conversation has been archived and can still be accessed from the RFX project page.",
    });
  };

  const handleDeleteConversation = () => {
    onDelete(conversationId);
    setIsDeleteDialogOpen(false);
  };

  const hasRFX = checkIfConversationHasRFX();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-navy-600 rounded">
            <MoreHorizontal size={14} className="text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem 
            onClick={() => setIsRenameModalOpen(true)}
            className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
          >
            <Edit size={14} className="mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={handleShare}
            className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
          >
            <Share size={14} className="mr-2" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={handleSaveAsRFX}
            className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
          >
            <FileText size={14} className="mr-2" />
            {hasRFX ? 'RFX Already Created' : 'Save as RFX'}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setIsDeleteDialogOpen(true)}
            className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 transition-colors"
          >
            <Trash2 size={14} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameConversationModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onSave={handleRename}
        initialTitle={conversationTitle}
      />

      <DeleteConversationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onDelete={handleDeleteConversation}
        onArchive={handleArchiveConversation}
        conversationTitle={conversationTitle}
        hasRFX={hasRFX}
      />
    </>
  );
};

export default ConversationMenu;
