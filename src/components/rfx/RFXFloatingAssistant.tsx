import React from 'react';
import { useNavigate } from 'react-router-dom';
import RFXAssistant from './RFXAssistant';

interface RFXFloatingAssistantProps {
  rfxId: string;
  specsCompletion?: {
    description: boolean;
    technical_requirements: boolean;
    company_requirements: boolean;
  };
}

const RFXFloatingAssistant: React.FC<RFXFloatingAssistantProps> = ({ 
  rfxId, 
  specsCompletion 
}) => {
  const navigate = useNavigate();

  // Check if any specs are filled
  const hasAnySpecs = specsCompletion && (
    specsCompletion.description || 
    specsCompletion.technical_requirements || 
    specsCompletion.company_requirements
  );

  // Check if all specs are complete
  const allSpecsComplete = specsCompletion && 
    specsCompletion.description && 
    specsCompletion.technical_requirements && 
    specsCompletion.company_requirements;

  // Get missing fields
  const getMissingFields = () => {
    if (!specsCompletion) return [];
    const missing = [];
    if (!specsCompletion.description) missing.push('Description');
    if (!specsCompletion.technical_requirements) missing.push('Technical Requirements');
    if (!specsCompletion.company_requirements) missing.push('Company Requirements');
    return missing;
  };

  const missingFields = getMissingFields();

  // Content when specs are partially filled
  const partialContent = (
    <>
      <p>Great progress! You've started filling out your RFX specifications.</p>
      <p className="font-semibold text-[#80c8f0]">You're still missing:</p>
      <ul className="list-disc ml-5 space-y-1">
        {missingFields.map(field => (
          <li key={field}>{field}</li>
        ))}
      </ul>
      <p>Let's complete these sections to move forward with your RFX!</p>
    </>
  );

  // Content when no specs are filled yet
  const initialContent = (
    <>
      <p>Here's the flow to complete an RFX:</p>
      <ol className="list-decimal ml-5 space-y-1">
        <li>Fill in the RFX specifications (with help from the RFX Agent).</li>
        <li>Select candidate suppliers manually or using FQ's database.</li>
        <li>Generate the documentation automatically and send the RFX in-platform.</li>
      </ol>
      <p>Let's start by filling in the RFX specifications!</p>
    </>
  );

  // Content when all specs are complete
  const completeContent = (
    <>
      <p>Excellent! Your RFX specifications are complete. 🎉</p>
      <p>Now it's time to select the candidate suppliers for your RFX.</p>
      <p>Don't worry, <span className="font-semibold text-[#80c8f0]">FQ will help you</span> select the best candidates from our extensive database. You can also add candidates manually if you prefer.</p>
      <p>Let's find the perfect suppliers for your project!</p>
    </>
  );

  // Determine which content to show
  const content = allSpecsComplete 
    ? completeContent 
    : hasAnySpecs 
      ? partialContent 
      : initialContent;

  const title = allSpecsComplete 
    ? "Your RFX specifications are ready!" 
    : hasAnySpecs 
      ? "Almost there!" 
      : "Need help with your RFX?";

  return (
    <RFXAssistant
      title={title}
      content={content}
      primaryAction={
        allSpecsComplete
          ? {
              label: 'Go to Candidates',
              onClick: () => navigate(`/rfxs/candidates/${rfxId}`)
            }
          : {
              label: 'Go to RFX specifications',
              onClick: () => navigate(`/rfxs/specs/${rfxId}`)
            }
      }
    />
  );
};

export default RFXFloatingAssistant;


