
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Plus } from 'lucide-react';

interface ActionChecklistProps {
  checklist: Array<{
    id: number;
    label: string;
    completed: boolean;
  }>;
}

const ActionChecklist = ({ checklist }: ActionChecklistProps) => {
  const completedCount = checklist.filter(item => item.completed).length;
  const totalCount = checklist.length;
  const progressPercentage = (completedCount / totalCount) * 100;

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-intro text-[#1b2c4a]">Action Checklist</h2>
        <div className="text-sm font-medium text-gray-600 font-inter">
          {completedCount} of {totalCount} completed
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600 font-inter">Progress</span>
          <span className="text-sm font-bold text-[#1b2c4a] font-inter">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <motion.div
            className="bg-gradient-to-r from-[#7de19a] to-[#80c8f0] h-3 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
      
      {/* Checklist items */}
      <div className="space-y-4">
        {checklist.map((item, index) => (
          <motion.div
            key={item.id}
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ x: 4 }}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {item.completed ? (
                <CheckCircle2 className="w-6 h-6 text-[#7de19a]" />
              ) : (
                <Circle className="w-6 h-6 text-gray-400" />
              )}
            </motion.div>
            
            <div className="flex-1">
              <span className={`font-medium font-inter ${
                item.completed ? 'text-gray-500 line-through' : 'text-[#1b2c4a]'
              }`}>
                {item.label}
              </span>
              {!item.completed && (
                <div className="text-xs text-[#80c8f0] font-inter mt-1">
                  +5 points to Global Score
                </div>
              )}
            </div>
            
            {!item.completed && (
              <Plus className="w-5 h-5 text-gray-400" />
            )}
          </motion.div>
        ))}
      </div>
      
      {/* Bottom CTA */}
      <motion.div
        className="mt-6 p-4 bg-gradient-to-r from-[#80c8f0]/10 to-[#7de19a]/10 rounded-xl border border-[#80c8f0]/20"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="text-sm font-medium text-[#1b2c4a] font-inter mb-2">
          Complete all actions to unlock:
        </div>
        <ul className="text-xs text-gray-600 font-inter space-y-1">
          <li>• Enhanced profile visibility</li>
          <li>• Priority in search results</li>
          <li>• Access to premium analytics</li>
        </ul>
      </motion.div>
    </div>
  );
};

export default ActionChecklist;
