
import React, { useState } from 'react';
import { History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RenameConversationModal from './RenameConversationModal';

interface NewSearchButtonProps {
  onClick?: () => void;
}

const NewSearchButton: React.FC<NewSearchButtonProps> = ({ onClick }) => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [chatId, setChatId] = useState('');

  const handleClick = () => {
    // Call the provided onClick handler (which should reset the chat)
    if (onClick) {
      onClick();
    }
    
    // Create a new chat ID
    const newChatId = `chat-${Date.now()}`;
    setChatId(newChatId);
    
    // Open the modal to name this conversation
    setIsModalOpen(true);
    
    // Navigate to the new chat route
    navigate(`/chat/${newChatId}`);
  };

  const handleSaveTitle = (title: string) => {
    // Get existing conversations
    const savedConversations = localStorage.getItem('fq-conversations');
    const conversations = savedConversations ? JSON.parse(savedConversations) : [];
    
    // Create a new conversation object
    const newConversation = {
      id: chatId,
      title: title || 'New conversation', // Default if empty
      timestamp: new Date().toISOString(),
      hasUnread: false
    };
    
    // Add to the beginning of the array and limit to 10
    const updatedConversations = [newConversation, ...conversations].slice(0, 10);
    
    // Save back to localStorage
    localStorage.setItem('fq-conversations', JSON.stringify(updatedConversations));
  };

  return (
    <>
      <button 
        className="flex items-center gap-2 text-white font-medium px-5 py-2.5 rounded-[20px] transition-colors shadow-md" style={{backgroundColor: '#f4a9aa'}} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5DB8ED'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f4a9aa'}
        onClick={handleClick}
      >
        <History size={16} />
        <span>New search</span>
      </button>

      <RenameConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTitle}
        initialTitle="New conversation"
      />
    </>
  );
};

export default NewSearchButton;
