import React from 'react';
import RFXAssistant from './RFXAssistant';

interface RFXCandidatesAssistantProps {
  hasCandidates: boolean;
  onAskAgent: () => void;
  onSelectCandidates: () => void;
}

const RFXCandidatesAssistant: React.FC<RFXCandidatesAssistantProps> = ({ 
  hasCandidates, 
  onAskAgent,
  onSelectCandidates 
}) => {
  // Content when there are no candidates yet
  const noCandidatesContent = (
    <>
      <p>Now it's time to find the best suppliers for your RFX!</p>
      
      <p>First, click the <span className="font-semibold text-[#80c8f0]">"Ask FQ Agent"</span> button below to let FQ's AI analyze your specifications and recommend the most suitable candidates from our database.</p>
      
      <p>The agent will evaluate suppliers based on your technical requirements, company needs, and project specifications to find the perfect matches.</p>
      
      <p>Once you receive recommendations, you'll be able to review and select the final candidates for your RFX!</p>
    </>
  );

  // Content when there are candidates
  const hasCandidatesContent = (
    <>
      <p>Great! FQ has found potential candidates for your RFX. 🎯</p>
      
      <p>Now you can:</p>
      <ul className="list-disc ml-5 space-y-1">
        <li>Review the recommended candidates and their details</li>
        <li>Click <span className="font-semibold text-[#80c8f0]">"Select Candidates for RFX"</span> below to choose which suppliers will participate</li>
        <li>Or click <span className="font-semibold text-[#80c8f0]">"Ask FQ Agent"</span> again to get new recommendations</li>
      </ul>
      
      <p>Select the candidates that best fit your project requirements!</p>
    </>
  );

  const content = hasCandidates ? hasCandidatesContent : noCandidatesContent;
  const title = hasCandidates ? "Time to select your candidates!" : "Let's find the perfect suppliers!";

  return (
    <RFXAssistant
      title={title}
      content={content}
      primaryAction={
        hasCandidates
          ? {
              label: 'Select Candidates for RFX',
              onClick: onSelectCandidates
            }
          : {
              label: 'Ask FQ Agent',
              onClick: onAskAgent
            }
      }
    />
  );
};

export default RFXCandidatesAssistant;

