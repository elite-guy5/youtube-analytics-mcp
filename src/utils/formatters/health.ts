import { ParsedAnalytics, ColumnHeader, calculatePercentageChange } from '../transformers/analytics.js';
import { formatNumber, formatPercentage } from '../transformers/statistics.js';
import { parseComparisonMetrics } from '../parsers/analytics.js';

export interface ChannelOverviewData {
  totalViews: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  averageViewDuration: number;
  averageViewPercentage?: number;
}

export interface ComparisonData {
  period1: ChannelOverviewData;
  period2: ChannelOverviewData;
  period1Info: { period: string };
  period2Info: { period: string };
  changes: {
    [metric: string]: {
      oldValue: number;
      newValue: number;
      change: number;
      percentChange: number;
      direction: '📈' | '📉' | '➡️';
    };
  };
}

export function parseChannelOverview(data: ParsedAnalytics): ChannelOverviewData {
  if (!data.rows || data.rows.length === 0) {
    return {
      totalViews: 0,
      estimatedMinutesWatched: 0,
      subscribersGained: 0,
      averageViewDuration: 0
    };
  }

  const metrics = data.columnHeaders?.map((header: ColumnHeader) => header.name) || [];
  const col = (name: string) => metrics.indexOf(name);
  const viewsIdx = col('views');

  // Rows may be one per day (dimensions=day): sum additive metrics across all
  // rows and weight averages by each row's views.
  let totalViews = 0;
  let minutes = 0;
  let subsGained = 0;
  let durationWeighted = 0;
  let percentageWeighted = 0;

  data.rows.forEach(row => {
    const views = viewsIdx >= 0 ? Number(row[viewsIdx] || 0) : 0;
    totalViews += views;
    if (col('estimatedMinutesWatched') >= 0) minutes += Number(row[col('estimatedMinutesWatched')] || 0);
    if (col('subscribersGained') >= 0) subsGained += Number(row[col('subscribersGained')] || 0);
    if (col('averageViewDuration') >= 0) durationWeighted += Number(row[col('averageViewDuration')] || 0) * views;
    if (col('averageViewPercentage') >= 0) percentageWeighted += Number(row[col('averageViewPercentage')] || 0) * views;
  });

  const result: ChannelOverviewData = {
    totalViews,
    estimatedMinutesWatched: minutes,
    subscribersGained: subsGained,
    averageViewDuration: totalViews > 0 ? durationWeighted / totalViews : 0
  };

  if (col('averageViewPercentage') >= 0) {
    result.averageViewPercentage = totalViews > 0 ? percentageWeighted / totalViews : 0;
  }

  return result;
}

export function formatChannelOverview(data: ChannelOverviewData, period?: string): string {
  let output = "Channel Health Overview:\n\n";
  
  output += "📊 Key Metrics:\n";
  output += `• Total Views: ${formatNumber(data.totalViews)}\n`;
  output += `• Watch Time (minutes): ${formatNumber(data.estimatedMinutesWatched)}\n`;
  output += `• Subscribers Gained: ${formatNumber(data.subscribersGained)}\n`;
  output += `• Average View Duration: ${data.averageViewDuration.toFixed(1)} seconds\n`;
  
  if (data.averageViewPercentage !== undefined) {
    output += `• Average View Percentage: ${formatPercentage(data.averageViewPercentage)}\n`;
  }

  if (period) {
    output += `\nNote: This represents aggregate performance for ${period}.`;
  } else {
    output += "\nNote: This represents aggregate performance for the selected time period.";
  }

  return output;
}

export function parseComparisonData(comparisonResult: any): ComparisonData | null {
  const parsed = parseComparisonMetrics(comparisonResult);
  if (!parsed) return null;

  const period1Data = parseChannelOverview(parsed.period1Data);
  const period2Data = parseChannelOverview(parsed.period2Data);

  const changes: ComparisonData['changes'] = {};
  
  // Compare every metric the API returned (comparison queries have no
  // dimensions, so each period is a single totals row)
  const metricValue = (analytics: ParsedAnalytics, name: string): number => {
    const idx = analytics.columnHeaders?.findIndex((h: ColumnHeader) => h.name === name) ?? -1;
    return idx >= 0 ? Number(analytics.rows?.[0]?.[idx] || 0) : 0;
  };
  const metricNames = parsed.period1Data.columnHeaders?.map((h: ColumnHeader) => h.name) || [];
  const metricsToCompare = metricNames.map((name: string) => ({
    key: name,
    p1: metricValue(parsed.period1Data, name),
    p2: metricValue(parsed.period2Data, name)
  }));

  metricsToCompare.forEach(metric => {
    // Period 1 is the baseline (old), period 2 the comparison (new)
    const change = metric.p2 - metric.p1;
    const percentChange = calculatePercentageChange(metric.p1, metric.p2);
    const direction = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';

    changes[metric.key] = {
      oldValue: metric.p1,
      newValue: metric.p2,
      change,
      percentChange,
      direction
    };
  });

  return {
    period1: period1Data,
    period2: period2Data,
    period1Info: parsed.period1Info,
    period2Info: parsed.period2Info,
    changes
  };
}

export function formatComparisonMetrics(comparisonData: ComparisonData): string {
  let output = "📈 Period-to-Period Comparison:\n\n";
  
  Object.entries(comparisonData.changes).forEach(([key, data]) => {
    let label = '';
    switch (key) {
      case 'views':
        label = 'Views';
        break;
      case 'estimatedMinutesWatched':
        label = 'Watch Time';
        break;
      case 'subscribersGained':
        label = 'Subscribers';
        break;
      default:
        label = key;
    }
    
    output += `${data.direction} ${label}: ${formatNumber(data.oldValue)} → ${formatNumber(data.newValue)} `;
    output += `(${data.change >= 0 ? '+' : ''}${formatNumber(data.change)}, ${formatPercentage(data.percentChange)})\n`;
  });

  return output;
}

export function generateHealthInsights(overviewData: ChannelOverviewData): string[] {
  const insights: string[] = [];
  
  // View duration insights
  if (overviewData.averageViewDuration > 0) {
    if (overviewData.averageViewDuration > 120) { // > 2 minutes
      insights.push("🎯 Excellent engagement: High average view duration");
    } else if (overviewData.averageViewDuration > 60) { // 1-2 minutes
      insights.push("✅ Good engagement: Moderate view duration");
    } else {
      insights.push("⚠️ Short view duration: Content may need better hooks");
    }
  }
  
  // Subscriber growth insights
  if (overviewData.subscribersGained > 100) {
    insights.push("📈 Strong growth: High subscriber acquisition");
  } else if (overviewData.subscribersGained > 10) {
    insights.push("📈 Steady growth: Consistent subscriber gains");
  } else if (overviewData.subscribersGained <= 0) {
    insights.push("⚠️ Growth concern: Low or negative subscriber change");
  }
  
  // Watch time insights
  if (overviewData.estimatedMinutesWatched > 10000) {
    insights.push("🔥 High watch time: Strong content performance");
  } else if (overviewData.estimatedMinutesWatched > 1000) {
    insights.push("✅ Decent watch time: Content is engaging viewers");
  }
  
  return insights;
}