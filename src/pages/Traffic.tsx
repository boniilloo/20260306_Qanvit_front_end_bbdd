import React, { useState, useMemo } from 'react';
import { useUserCount } from '@/hooks/useUserCount';
import { useUserAnalytics } from '@/hooks/useUserAnalytics';
import { useConversationCount } from '@/hooks/useConversationCount';
import { useConversationAnalytics } from '@/hooks/useConversationAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Users, Loader2, Calendar, BarChart3, MessageCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const Traffic = () => {
  const [chartPeriod, setChartPeriod] = useState<'day' | 'week'>('day');
  const [chartType, setChartType] = useState<'incremental' | 'cumulative'>('incremental');
  const [conversationChartPeriod, setConversationChartPeriod] = useState<'day' | 'week'>('day');
  const [conversationChartType, setConversationChartType] = useState<'incremental' | 'cumulative'>('incremental');
  const [excludeDevelopers, setExcludeDevelopers] = useState(true);
  const { userCount, loading, error } = useUserCount();
  const { conversationCount, loading: conversationCountLoading, error: conversationCountError } = useConversationCount(excludeDevelopers);
  const { data: analyticsData, loading: analyticsLoading, error: analyticsError } = useUserAnalytics(chartPeriod);
  const { data: conversationAnalyticsData, loading: conversationAnalyticsLoading, error: conversationAnalyticsError, loadingProgress } = useConversationAnalytics(conversationChartPeriod, excludeDevelopers);

  // Process user data based on chart type (incremental vs cumulative)
  const processedData = useMemo(() => {
    if (!analyticsData || analyticsData.length === 0) return [];
    
    if (chartType === 'incremental') {
      return analyticsData;
    } else {
      // Calculate cumulative totals
      let cumulativeTotal = 0;
      return analyticsData.map(item => {
        cumulativeTotal += item.count;
        return {
          ...item,
          count: cumulativeTotal
        };
      });
    }
  }, [analyticsData, chartType]);

  // Process conversation data based on chart type (incremental vs cumulative)
  const processedConversationData = useMemo(() => {
    if (!conversationAnalyticsData || conversationAnalyticsData.length === 0) return [];
    
    if (conversationChartType === 'incremental') {
      return conversationAnalyticsData;
    } else {
      // Calculate cumulative totals for both registered and anonymous conversations
      let cumulativeTotal = 0;
      let cumulativeAnonymousTotal = 0;
      return conversationAnalyticsData.map(item => {
        cumulativeTotal += item.count;
        cumulativeAnonymousTotal += item.anonymousCount;
        return {
          ...item,
          count: cumulativeTotal,
          anonymousCount: cumulativeAnonymousTotal
        };
      });
    }
  }, [conversationAnalyticsData, conversationChartType]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading traffic data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Traffic Dashboard</h1>
        <p className="text-gray-600 mt-2">Monitor user activity and platform statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Users Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Registered users in the platform
            </p>
          </CardContent>
        </Card>

        {/* Total Conversations Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversationCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {excludeDevelopers ? 'User conversations (registered + anonymous, excluding developers)' : 'All conversations (including developers)'}
            </p>
          </CardContent>
        </Card>

        {/* Activity Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">
              Platform is operational
            </p>
          </CardContent>
        </Card>

        {/* Growth Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">User Growth</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{userCount}</div>
            <p className="text-xs text-muted-foreground">
              Total registered users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Growth Chart */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {chartType === 'incremental' ? 'User Registration Growth' : 'Total User Growth'}
                </CardTitle>
                <CardDescription>
                  {chartType === 'incremental' 
                    ? 'New user registrations over time (from auth.users)'
                    : 'Cumulative total of registered users over time'
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={chartType === 'incremental' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartType('incremental')}
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Incremental
                </Button>
                <Button
                  variant={chartType === 'cumulative' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartType('cumulative')}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Cumulative
                </Button>
                <div className="border-l border-gray-300 mx-2"></div>
                <Button
                  variant={chartPeriod === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('day')}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Daily
                </Button>
                <Button
                  variant={chartPeriod === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('week')}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Weekly
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Loading chart data...</span>
                </div>
              </div>
            ) : analyticsError ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-red-600 mb-2">Error loading chart data</p>
                  <p className="text-sm text-muted-foreground">{analyticsError}</p>
                </div>
              </div>
            ) : processedData.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No data available</p>
                </div>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={processedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (chartPeriod === 'week') {
                          return value.replace('W', ' W');
                        }
                        return new Date(value).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        });
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      labelFormatter={(value, payload) => {
                        if (chartPeriod === 'week') {
                          return `Week ${value}`;
                        }
                        return new Date(value).toLocaleDateString('en-US', { 
                          year: 'numeric',
                          month: 'long', 
                          day: 'numeric' 
                        });
                      }}
                      formatter={(value: number, name, props) => {
                        const data = props.payload as any;
                        const emails = data?.userEmails || [];
                        
                        return [
                          <div key="tooltip-content">
                  <div className="font-medium mb-2">
                    {value} {chartType === 'incremental' ? 'New User Registrations' : 'Total Users'}
                  </div>
                            {emails.length > 0 && (
                              <div className="text-xs">
                                <div className="font-medium mb-1">User emails:</div>
                                <div className="max-h-32 overflow-y-auto">
                                  {emails.map((email: string, index: number) => (
                                    <div key={index} className="text-gray-600">
                                      {email}
                                    </div>
                                  ))}
                                </div>
                                {emails.length === 10 && (
                                  <div className="text-gray-500 italic mt-1">
                                    (showing first 10)
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ];
                      }}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        maxWidth: '300px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversation Growth Chart */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {conversationChartType === 'incremental' ? 'Conversation Growth' : 'Total Conversation Growth'}
                </CardTitle>
                <CardDescription>
                  {conversationChartType === 'incremental' 
                    ? `New conversations over time${excludeDevelopers ? ' (users only, excluding developers)' : ' (all users including developers)'}`
                    : `Cumulative total of conversations over time${excludeDevelopers ? ' (users only, excluding developers)' : ' (all users including developers)'}`
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={conversationChartType === 'incremental' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConversationChartType('incremental')}
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Incremental
                </Button>
                <Button
                  variant={conversationChartType === 'cumulative' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConversationChartType('cumulative')}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Cumulative
                </Button>
                <div className="border-l border-gray-300 mx-2"></div>
                <Button
                  variant={conversationChartPeriod === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConversationChartPeriod('day')}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Daily
                </Button>
                <Button
                  variant={conversationChartPeriod === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConversationChartPeriod('week')}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Weekly
                </Button>
                <div className="border-l border-gray-300 mx-2"></div>
                <Button
                  variant={excludeDevelopers ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExcludeDevelopers(!excludeDevelopers)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  {excludeDevelopers ? 'Users Only' : 'All Users'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {conversationAnalyticsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Loading conversation data...</span>
                  {loadingProgress && (
                    <span className="text-sm text-muted-foreground">{loadingProgress}</span>
                  )}
                </div>
              </div>
            ) : conversationAnalyticsError ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-red-600 mb-2">Error loading conversation data</p>
                  <p className="text-sm text-muted-foreground">{conversationAnalyticsError}</p>
                </div>
              </div>
            ) : processedConversationData.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No conversation data available</p>
                </div>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={processedConversationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (conversationChartPeriod === 'week') {
                          return value.replace('W', ' W');
                        }
                        return new Date(value).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        });
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        
                        const data = payload[0].payload;
                        const conversationIds = data?.conversationIds || [];
                        const anonymousConversationIds = data?.anonymousConversationIds || [];
                        const anonymousCount = data?.anonymousCount || 0;
                        const registeredCount = data?.count || 0;
                        
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs">
                            <div className="font-medium mb-2">
                              {conversationChartPeriod === 'week' ? `Week ${label}` : new Date(label).toLocaleDateString('en-US', { 
                                year: 'numeric',
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </div>
                            <div className="font-medium mb-2 text-green-600">
                              {conversationChartType === 'incremental' ? 'New Conversations' : 'Total Conversations'}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-sm">
                                  {registeredCount} {excludeDevelopers ? "Registered Users" : "All Registered Users"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                                <span className="text-sm">
                                  {anonymousCount} Anonymous Users
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                      name={excludeDevelopers ? "Registered Users" : "All Registered Users"}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="anonymousCount" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2 }}
                      name="Anonymous Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Information */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Traffic Overview</CardTitle>
            <CardDescription>
              Current platform statistics and user metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Registered Users:</span>
                <span className="text-sm text-muted-foreground">{userCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Conversations:</span>
                <span className="text-sm text-muted-foreground">{conversationCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Platform Status:</span>
                <span className="text-sm text-green-600">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Updated:</span>
                <span className="text-sm text-muted-foreground">{new Date().toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Traffic;
