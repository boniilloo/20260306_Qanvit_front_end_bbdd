
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp, Crown } from 'lucide-react';

const ClaimBanner = () => {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#80c8f0] to-[#1bb3ff] p-8 text-white"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-4 right-4 w-32 h-32 border border-white rounded-full"></div>
        <div className="absolute bottom-4 left-4 w-24 h-24 border border-white rounded-full"></div>
      </div>
      
      <div className="relative flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-8 h-8 text-yellow-300" />
            <h2 className="text-2xl font-bold font-intro">Claim Your Company Profile</h2>
          </div>
          
          <p className="text-lg mb-4 font-inter opacity-90">
            Take control of your presence and unlock premium features
          </p>
          
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-green-300" />
            <span className="font-semibold font-inter">Suppliers who claim see +35% more visibility</span>
          </div>
          
          <Button 
            size="lg" 
            className="bg-white text-[#1bb3ff] hover:bg-gray-100 font-bold font-inter px-8 py-3 rounded-xl shadow-lg"
          >
            Claim This Company
          </Button>
        </div>
        
        {/* Illustration */}
        <div className="hidden lg:block">
          <motion.div
            className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <motion.div
              className="w-20 h-20 bg-white/30 rounded-full flex items-center justify-center"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            >
              <TrendingUp className="w-10 h-10 text-white" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClaimBanner;
