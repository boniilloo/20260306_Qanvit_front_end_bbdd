
import React, { useState, useEffect } from 'react';
import FQAvatar from './FQAvatar';
import SearchProgressIndicator from './SearchProgressIndicator';

interface TypingIndicatorProps {
  message?: string;
  showProgress?: boolean;
  isSearching?: boolean; // New prop to distinguish if it's a supplier search
}

const industrialMessages = [
  "FQ is analyzing your industrial requirements...",
  "Searching for specialized suppliers...",
  "Evaluating technical capabilities...",
  "Preparing personalized recommendations..."
];

const searchSteps = [
  "Analyzing industrial requirements",
  "Searching for specialized suppliers", 
  "Evaluating technical capabilities",
  "Calculating compatibility scores",
  "Preparing recommendations"
];

const TypingIndicator = ({ message, showProgress = false, isSearching = false }: TypingIndicatorProps) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayMessage, setDisplayMessage] = useState(message || "FQ is working on your query...");
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!message && isSearching) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % industrialMessages.length);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [message, isSearching]);

  useEffect(() => {
    if (!message) {
      if (isSearching) {
        setDisplayMessage(industrialMessages[currentMessageIndex]);
      } else {
        setDisplayMessage("FQ is working on your query...");
      }
    }
  }, [currentMessageIndex, message, isSearching]);

  // Eliminar la barra de progreso y los pasos

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-6">
      <div className="flex items-start space-x-4">
        <FQAvatar className="mt-1 shadow-sm flex-shrink-0" isThinking={true} />
        <div className="flex-1 min-w-0">
          <div className="inline-block bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 animate-pulse">
            <div className="flex items-center space-x-2 ml-2">
              {message && (
                <span className="text-sm text-[#1b2c4a] font-medium">{message}</span>
              )}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500 italic">Reasoning</span>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
