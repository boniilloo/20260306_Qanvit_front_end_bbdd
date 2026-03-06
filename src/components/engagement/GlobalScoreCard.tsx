
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';

interface GlobalScoreCardProps {
  scores: {
    contentQuality: number;
    productCatalog: number;
    compliance: number;
    financialHealth: number;
  };
}

const GlobalScoreCard = ({ scores }: GlobalScoreCardProps) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  
  // Calculate weighted average (25% each)
  const globalScore = Math.round(
    (scores.contentQuality + scores.productCatalog + scores.compliance + scores.financialHealth) / 4
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValue(globalScore);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [globalScore]);

  const getScoreBadge = (score: number) => {
    if (score >= 85) return { label: 'Excellent', color: 'bg-[#7de19a] text-white' };
    if (score >= 70) return { label: 'Good', color: 'bg-[#80c8f0] text-white' };
    if (score >= 55) return { label: 'Fair', color: 'bg-yellow-500 text-white' };
    return { label: 'Poor', color: 'bg-red-500 text-white' };
  };

  const getColor = (val: number) => {
    if (val >= 85) return '#7de19a';
    if (val >= 70) return '#80c8f0';
    if (val >= 55) return '#f59e0b';
    return '#ef4444';
  };

  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  const badge = getScoreBadge(globalScore);

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl font-bold font-intro text-[#1b2c4a]">Global Score</h2>
        <div className="group relative">
          <Info className="w-4 h-4 text-gray-400 cursor-help" />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block">
            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
              Weighted average: Content 25% · Product 25% · Compliance 25% · Financial 25%
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col items-center">
        {/* Large circular gauge */}
        <div className="relative">
          <svg width="220" height="220" className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke="#f1f1f1"
              strokeWidth="12"
            />
            
            {/* Progress circle */}
            <motion.circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={getColor(globalScore)}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ 
                duration: 1.5, 
                ease: "easeOut",
                delay: 0.3
              }}
              style={{
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))'
              }}
            />
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              className="text-5xl font-bold font-intro text-[#1b2c4a]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 200 }}
            >
              {Math.round(animatedValue)}
            </motion.div>
            <div className="text-sm font-medium text-gray-500 font-inter">
              / 100
            </div>
          </div>
        </div>
        
        {/* Score badge */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          <Badge className={`${badge.color} px-4 py-2 text-sm font-semibold font-inter`}>
            {badge.label}
          </Badge>
        </motion.div>
        
        {/* Score breakdown */}
        <div className="mt-6 w-full space-y-2">
          <div className="text-xs font-semibold text-gray-600 font-inter mb-3">SCORE BREAKDOWN</div>
          
          {Object.entries(scores).map(([key, value]) => {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            return (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 font-inter">{label}</span>
                <span className="font-semibold text-[#1b2c4a] font-inter">{value}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GlobalScoreCard;
