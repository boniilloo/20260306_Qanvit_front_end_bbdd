
import React from 'react';
import { CheckCircle, Clock, Search, Zap } from 'lucide-react';

interface SearchProgressIndicatorProps {
  currentStep: number;
  steps: string[];
}

const SearchProgressIndicator = ({ currentStep, steps }: SearchProgressIndicatorProps) => {
  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
      <div className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1b2c4a] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#80c8f0]" />
          Industrial Search Process
        </h3>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {currentStep + 1} of {steps.length}
        </span>
      </div>
      
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              index < currentStep 
                ? 'bg-emerald-100 text-emerald-600' 
                : index === currentStep 
                  ? 'bg-[#80c8f0] text-white animate-pulse' 
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {index < currentStep ? (
                <CheckCircle className="w-4 h-4" />
              ) : index === currentStep ? (
                <Search className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
            <span className={`text-sm transition-colors duration-300 ${
              index <= currentStep ? 'text-[#1b2c4a] font-medium' : 'text-gray-400'
            }`}>
              {step}
            </span>
          </div>
        ))}
      </div>
      
      <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[#80c8f0] to-[#7de19a] transition-all duration-500 ease-out"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>
      </div>
    </div>
  );
};

export default SearchProgressIndicator;
