import React from 'react';
import RFXAssistant from './RFXAssistant';

const RFXSpecsAssistant: React.FC = () => {
  const content = (
    <>
      <p>Here you'll define the basic specifications of your RFX.</p>
      
      <p>We know filling out this document completely can be tedious, so we've programmed an <span className="font-semibold text-[#f4a9aa]">RFX Assistant</span> on the right that will be happy to fill out the RFX for you! Just ask and it will help.</p>
      
      <p>Don't forget to add the project timeline and images to complete your RFQ - they make a big difference!</p>
      
      <p>Finally, at the bottom you'll find a button to generate a PDF with all the information provided. You can even customize it with your company's colors and logos in the <span className="font-semibold text-[#f4a9aa]">PDF Customization</span> section.</p>
    </>
  );

  return (
    <RFXAssistant
      title="Let's define your RFX specifications!"
      content={content}
    />
  );
};

export default RFXSpecsAssistant;

