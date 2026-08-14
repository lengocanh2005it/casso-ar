import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AiUsageAggregateItem,
  type AiUsageTrendPoint,
  getAiUsage,
  getAiUsageTrend,
} from '../api/admin-api';

function last7DayRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function AdminDashboardPage() {
  const [topOrgs, setTopOrgs] = useState<AiUsageAggregateItem[]>([]);
  const [trend, setTrend] = useState<AiUsageTrendPoint[]>([]);

  useEffect(() => {
    const { from, to } = last7DayRange();
    void getAiUsage(from, to).then((result) => setTopOrgs(result.items));
    void getAiUsageTrend(from, to).then((result) => setTrend(result.items));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Top organizations theo usage (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOrgs}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="organizationName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="requestCount" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Xu hướng usage theo ngày (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="requestCount"
                stroke="var(--chart-2)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
