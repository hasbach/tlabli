"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsSnapshot } from "@/lib/types";

export function AnalyticsCharts({ analytics }: { analytics: AnalyticsSnapshot }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sales this week</CardTitle>
        </CardHeader>
        <CardContent className="h-64 pt-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip
                formatter={(value: number) => [`$${value}`, "Sales"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
              <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peak ordering hours</CardTitle>
        </CardHeader>
        <CardContent className="h-64 pt-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
              <Bar dataKey="orders" fill="var(--secondary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Most ordered items</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {analytics.topItems.map((item, idx) => (
              <div key={item.title} className="flex items-center gap-3">
                <span className="w-5 text-sm font-bold text-muted-foreground">{idx + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.count} sold</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(item.count / analytics.topItems[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
