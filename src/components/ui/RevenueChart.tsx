import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RevenueChartProps {
  revenues: any;
  companyName: string;
  currencyLabel?: string; // Optional explicit currency label for Y axis
}

const RevenueChart: React.FC<RevenueChartProps> = ({ revenues, companyName, currencyLabel }) => {
  // Parse and format revenue data
  const parseRevenueData = () => {
    try {
      let revenuesList;
      if (typeof revenues === 'string') {
        revenuesList = revenues.startsWith('[') || revenues.startsWith('{')
          ? JSON.parse(revenues) 
          : [revenues];
      } else {
        revenuesList = revenues;
      }

      // Convert to chart-friendly format
      let chartData = [];

      if (Array.isArray(revenuesList)) {
        chartData = revenuesList.map((revenue, index) => {
          if (typeof revenue === 'object' && revenue.year && revenue.amount) {
            // Extract numeric value from amount string
            const numericAmount = parseFloat(revenue.amount.toString().replace(/[^\d.-]/g, ''));
            return {
              year: revenue.year.toString(),
              amount: numericAmount,
              originalAmount: revenue.amount,
              label: `${revenue.year}: ${revenue.amount}`
            };
          } else if (typeof revenue === 'string') {
            // Try to parse year and amount from string
            const yearMatch = revenue.match(/20\d{2}/);
            const amountMatch = revenue.match(/[\d.,]+[KMB]?/);
            
            return {
              year: yearMatch ? yearMatch[0] : `Year ${index + 1}`,
              amount: amountMatch ? parseFloat(amountMatch[0].replace(/[^\d.-]/g, '')) : index + 1,
              originalAmount: revenue,
              label: revenue
            };
          }
          return null;
        }).filter(Boolean);
      } else if (typeof revenuesList === 'object' && revenuesList !== null) {
        // Handle object format
        chartData = Object.entries(revenuesList).map(([key, value]) => {
          const numericAmount = parseFloat(value.toString().replace(/[^\d.-]/g, ''));
          return {
            year: key,
            amount: numericAmount,
            originalAmount: value,
            label: `${key}: ${value}`
          };
        });
      }

      // Sort by year
      chartData.sort((a, b) => {
        const yearA = parseInt(a.year.toString().replace(/\D/g, ''));
        const yearB = parseInt(b.year.toString().replace(/\D/g, ''));
        return yearA - yearB;
      });

      return chartData;
    } catch (error) {
      console.error('Error parsing revenue data:', error);
      return [];
    }
  };

  const chartData = parseRevenueData();

  // Extract raw list from input for currency inference (matches edit form shape)
  const getRawRevenuesList = () => {
    try {
      if (typeof revenues === 'string') {
        const parsed = revenues.startsWith('[') || revenues.startsWith('{') ? JSON.parse(revenues) : revenues;
        return parsed;
      }
      return revenues;
    } catch {
      return revenues;
    }
  };

  // Try to infer currency from original values
  const detectCurrencyFromInput = () => {
    const raw = getRawRevenuesList();
    // If it's an array of objects with { year, amount, currency }
    if (Array.isArray(raw)) {
      for (const r of raw) {
        if (r && typeof r === 'object' && 'currency' in r && r.currency) {
          return String(r.currency);
        }
      }
      // Fallback to checking amount strings for symbols/codes
      for (const r of raw) {
        const amt = r && typeof r === 'object' ? (r.amount ?? '') : r;
        const s = String(amt || '').toUpperCase();
        if (!s) continue;
        if (/[€]/.test(s)) return '€';
        if (/\$|US\$|CA\$|AU\$|HK\$|R\$/.test(s)) return '$';
        if (/[£]/.test(s)) return '£';
        if (/[¥]/.test(s)) return '¥';
        const match = s.match(/\b(USD|EUR|GBP|JPY|CNY|RMB|INR|AUD|CAD|CHF|SEK|NOK|DKK|MXN|BRL|RUB|HKD|SGD)\b/);
        if (match) return match[1].toUpperCase();
      }
    }
    return null;
  };

  // Secondary fallback: inspect parsed chart data text
  const detectCurrencyFromChartData = () => {
    for (const point of chartData) {
      const original = (point as any).originalAmount;
      const s = String(original || '').toUpperCase();
      if (!s) continue;
      if (/[€]/.test(s)) return '€';
      if (/\$|US\$|CA\$|AU\$|HK\$|R\$/.test(s)) return '$';
      if (/[£]/.test(s)) return '£';
      if (/[¥]/.test(s)) return '¥';
      const match = s.match(/\b(USD|EUR|GBP|JPY|CNY|RMB|INR|AUD|CAD|CHF|SEK|NOK|DKK|MXN|BRL|RUB|HKD|SGD)\b/);
      if (match) return match[1].toUpperCase();
    }
    return null;
  };

  const currency = currencyLabel || detectCurrencyFromInput() || detectCurrencyFromChartData();

  

  if (chartData.length === 0) {
    return null;
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-navy font-semibold">{label}</p>
          <p className="text-emerald-600">
            <DollarSign className="w-4 h-4 inline mr-1" />
            {data.originalAmount}
          </p>
        </div>
      );
    }
    return null;
  };

  // Determine chart type based on data
  const useLineChart = chartData.length > 2;

  return (
    <Card className="shadow-none border-0 h-[432px]">
      <CardContent className="h-full flex flex-col">
        <div className="w-full mt-[15px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            {useLineChart ? (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="year" 
                  stroke="#64748b"
                  fontSize={12}
                  label={{ value: 'Year', position: 'insideBottom', offset: -15 }}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                    return value.toString();
                  }}
                  label={{ value: `Revenue${currency ? ` (${currency})` : ''}`, angle: -90, position: 'insideLeft', offset: 0 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 6 }}
                  activeDot={{ r: 8, fill: "hsl(var(--primary))" }}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="year" 
                  stroke="#64748b"
                  fontSize={12}
                  label={{ value: 'Year', position: 'insideBottom', offset: -15 }}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                    return value.toString();
                  }}
                  label={{ value: `Revenue${currency ? ` (${currency})` : ''}`, angle: -90, position: 'insideLeft', offset: 0 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="amount" 
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        
        
      </CardContent>
    </Card>
  );
};

export default RevenueChart;