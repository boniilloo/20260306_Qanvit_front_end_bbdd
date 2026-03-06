
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

interface TrendSectionProps {
  trendData: {
    profileViews: number[];
    searchAppearances: number[];
  };
}

const TrendSection = ({ trendData }: TrendSectionProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [selectedMetric, setSelectedMetric] = useState('profileViews');

  const periods = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' }
  ];

  const metrics = [
    { value: 'profileViews', label: 'Profile Views', color: '#80c8f0' },
    { value: 'searchAppearances', label: 'Search Appearances', color: '#7de19a' }
  ];

  // Convert array data to chart format
  const chartData = trendData[selectedMetric as keyof typeof trendData].map((value, index) => ({
    day: index + 1,
    value
  }));

  const selectedMetricData = metrics.find(m => m.value === selectedMetric);

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-intro text-[#1b2c4a]">Trends</h2>
        
        <div className="flex gap-2">
          {periods.map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              className={`px-3 py-1 rounded-lg text-sm font-medium font-inter transition-colors ${
                selectedPeriod === period.value
                  ? 'bg-[#80c8f0] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Metric selector */}
      <div className="flex gap-4 mb-6">
        {metrics.map((metric) => (
          <button
            key={metric.value}
            onClick={() => setSelectedMetric(metric.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
              selectedMetric === metric.value
                ? 'border-[#80c8f0] bg-[#80c8f0]/10'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: metric.color }}
            />
            <span className="text-sm font-medium font-inter">{metric.label}</span>
          </button>
        ))}
      </div>
      
      {/* Chart */}
      <motion.div
        className="h-64"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis 
              dataKey="day" 
              axisLine={false} 
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={selectedMetricData?.color}
              strokeWidth={3}
              dot={{ fill: selectedMetricData?.color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: selectedMetricData?.color, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
};

export default TrendSection;
