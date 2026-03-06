
import React from 'react';
import { motion } from 'framer-motion';
import ClaimBanner from './ClaimBanner';
import KpiCard from './KpiCard';
import ScoresGrid from './ScoresGrid';
import GlobalScoreCard from './GlobalScoreCard';
import TrendSection from './TrendSection';
import ActionChecklist from './ActionChecklist';
import TestimonialsTeaser from './TestimonialsTeaser';

interface EngagementTabProps {
  metrics: {
    isClaimed: boolean;
    searchAppearances: number;
    profileViews: number;
    rfxsReceived: number;
    savedByBuyers: number;
    scores: {
      contentQuality: number;
      productCatalog: number;
      compliance: number;
      financialHealth: number;
    };
    trendData: {
      profileViews: number[];
      searchAppearances: number[];
    };
    checklist: Array<{
      id: number;
      label: string;
      completed: boolean;
    }>;
  };
}

const EngagementTab = ({ metrics }: EngagementTabProps) => {
  const kpiData = [
    {
      title: 'Search Appearances',
      value: metrics.searchAppearances,
      subtitle: 'Last 30 days',
      trend: '+12%',
      color: 'blue' as const
    },
    {
      title: 'Profile Views',
      value: metrics.profileViews,
      subtitle: 'Unique visitors',
      trend: '+8%',
      color: 'green' as const
    },
    {
      title: 'RFXs Received',
      value: metrics.rfxsReceived,
      subtitle: 'This month',
      trend: '+24%',
      color: 'navy' as const
    },
    {
      title: 'Saved by Buyers',
      value: metrics.savedByBuyers,
      subtitle: 'Total',
      trend: '+15%',
      color: 'blue' as const
    }
  ];

  return (
    <div className="space-y-8">
      {/* Claim Banner */}
      {!metrics.isClaimed && <ClaimBanner />}
      
      {/* KPI Deck */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, staggerChildren: 0.1 }}
      >
        {kpiData.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <KpiCard {...kpi} />
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column - Scores */}
        <div className="xl:col-span-2 space-y-8">
          <ScoresGrid scores={metrics.scores} />
          <TrendSection trendData={metrics.trendData} />
          <ActionChecklist checklist={metrics.checklist} />
        </div>
        
        {/* Right Column - Global Score & Testimonials */}
        <div className="space-y-8">
          <GlobalScoreCard scores={metrics.scores} />
          <TestimonialsTeaser />
        </div>
      </div>
    </div>
  );
};

export default EngagementTab;
