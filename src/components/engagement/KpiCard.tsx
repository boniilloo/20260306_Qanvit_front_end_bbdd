
import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number;
  subtitle: string;
  trend: string;
  color: 'blue' | 'green' | 'navy';
}

const KpiCard = ({ title, value, subtitle, trend, color }: KpiCardProps) => {
  const isPositive = trend.startsWith('+');
  
  const colorClasses = {
    blue: 'bg-gradient-to-br from-[#f4a9aa]/10 to-[#1bb3ff]/10 border-[#f4a9aa]/30',
    green: 'bg-gradient-to-br from-[#f4a9aa]/10 to-[#f4a9aa]/20 border-[#f4a9aa]/30',
    navy: 'bg-gradient-to-br from-[#22183a]/10 to-[#22183a]/20 border-[#22183a]/30'
  };

  const textColorClasses = {
    blue: 'text-[#1bb3ff]',
    green: 'text-[#f4a9aa]',
    navy: 'text-[#22183a]'
  };

  return (
    <motion.div
      className={`kpi-card p-6 rounded-2xl border ${colorClasses[color]} backdrop-blur-sm hover:shadow-lg transition-all duration-300`}
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-600 font-inter">{title}</h3>
        
        <div className="flex items-end justify-between">
          <div>
            <motion.div
              className={`text-3xl font-bold font-intro ${textColorClasses[color]}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              {value.toLocaleString()}
            </motion.div>
            <p className="text-xs text-gray-500 font-inter mt-1">{subtitle}</p>
          </div>
          
          <motion.div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
              isPositive 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default KpiCard;
