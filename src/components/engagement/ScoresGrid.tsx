
import React from 'react';
import { motion } from 'framer-motion';
import RadialGauge from './RadialGauge';

interface ScoresGridProps {
  scores: {
    contentQuality: number;
    productCatalog: number;
    compliance: number;
    financialHealth: number;
  };
}

const ScoresGrid = ({ scores }: ScoresGridProps) => {
  const scoreData = [
    {
      title: 'Content Quality',
      value: scores.contentQuality,
      description: 'Profile completeness and content quality'
    },
    {
      title: 'Product Catalog',
      value: scores.productCatalog,
      description: 'Product information and catalog completeness'
    },
    {
      title: 'Compliance',
      value: scores.compliance,
      description: 'Certifications and compliance status'
    },
    {
      title: 'Financial Health',
      value: scores.financialHealth,
      description: 'Financial stability and reporting'
    }
  ];

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
      <h2 className="text-2xl font-bold mb-6 font-intro text-[#1b2c4a]">Performance Scores</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {scoreData.map((score, index) => (
          <motion.div
            key={score.title}
            className="text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
          >
            <RadialGauge 
              value={score.value} 
              size={180} 
              title={score.title}
            />
            <p className="text-sm text-gray-600 font-inter mt-3 max-w-[160px] mx-auto">
              {score.description}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ScoresGrid;
