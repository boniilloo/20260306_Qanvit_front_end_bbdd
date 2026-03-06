
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface RadialGaugeProps {
  value: number;
  size: number;
  title: string;
}

const RadialGauge = ({ value, size, title }: RadialGaugeProps) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValue(value);
    }, 200);
    
    return () => clearTimeout(timer);
  }, [value]);

  const getColor = (val: number) => {
    if (val >= 80) return '#7de19a'; // green
    if (val >= 60) return '#80c8f0'; // blue
    return '#1b2c4a'; // navy
  };

  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  return (
    <div className="gauge relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f1f1"
          strokeWidth="8"
        />
        
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(value)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ 
            duration: 1.2, 
            ease: "easeOut",
            delay: 0.2
          }}
          style={{
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))'
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          className="text-3xl font-bold font-intro text-[#1b2c4a]"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
        >
          {Math.round(animatedValue)}
        </motion.div>
        <div className="text-xs font-medium text-gray-500 font-inter mt-1">
          {title}
        </div>
      </div>
    </div>
  );
};

export default RadialGauge;
