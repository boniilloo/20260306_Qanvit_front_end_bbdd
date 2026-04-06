import React from 'react';

interface RFXChatQuickPromptsProps {
  rfxName: string;
  rfxDescription?: string;
  onSelectPrompt: (text: string) => void;
  disabled?: boolean;
}

const RFXChatQuickPrompts: React.FC<RFXChatQuickPromptsProps> = ({
  rfxName,
  rfxDescription,
  onSelectPrompt,
  disabled = false,
}) => {
  if (disabled) return null;

  const prompts = [
    {
      label: 'Make an RFX for a project called...',
      getText: () => {
        const projectName = rfxName?.trim() || 'Untitled project';
        const projectDescription = rfxDescription?.trim() || 'No description provided.';
        return `Make an RFX for a project called "${projectName}". Further details: ${projectDescription}.`;
      },
    },
    {
      label: 'Autofill TODO',
      getText: () =>
        'Fill in all the buyer-related TODO fields with reasonable values based on the context.',
    },
    {
      label: 'Generate RFX now',
      getText: () =>
        'Generate the final RFX now. Use the your dedicated tool without asking more questions.',
    },
  ];

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {prompts.map((p, i) => (
        <button
          key={i}
          onClick={() => {
            onSelectPrompt(p.getText());
          }}
          className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full border border-gray-200 transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};

export default RFXChatQuickPrompts;
