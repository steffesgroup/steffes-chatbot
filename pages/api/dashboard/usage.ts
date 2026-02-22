import type { NextApiRequest, NextApiResponse } from 'next';

import { ChatLogger } from '../../../steffes-packages/chat-logger';
import { parseDashboardRange } from '../../../utils/server/dashboardRange';
import { requireRole } from '../../../utils/server/identity';

const chatLogger = new ChatLogger();

export type DashboardUsageSummary = {
  userId: string;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalAssistantMessages: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardUsageEvent = {
  userId: string;
  conversationId: string;
  assistantMessageIndex: number;
  modelId?: string;
  pricingModelId?: string;
  priced: boolean;
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
  createdAt: string;
};

export type DashboardUsageTotals = {
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  assistantMessages: number;
  pricedAssistantMessages: number;
};

export type DashboardUsageByDayRow = {
  day: string; // YYYY-MM-DD
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  assistantMessages: number;
};

export type DashboardUsageByModelRow = {
  model: string;
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  assistantMessages: number;
  pricedAssistantMessages: number;
};

export type DashboardUsageByUserRow = {
  userId: string;
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  assistantMessages: number;
};

export type DashboardUsageResponse = {
  range: '24h' | '7d' | '30d' | 'all';
  summaries: DashboardUsageSummary[];
  events: DashboardUsageEvent[];
  totals: DashboardUsageTotals;
  byDay: DashboardUsageByDayRow[];
  byModel: DashboardUsageByModelRow[];
  topUsers: DashboardUsageByUserRow[];
  requestChargeRU: {
    summaries: number;
    events: number;
    total: number;
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardUsageResponse | { error: string }>,
) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const rangeInfo = parseDashboardRange(req.query.range);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(','));
    }

    requireRole(headers, 'admin');

    const container = (await chatLogger.containerResponsePromise).container;

    const summariesQuery = {
      query:
        'SELECT TOP 200 c.userId, c.totalCostUSD, c.totalInputTokens, c.totalOutputTokens, c.totalAssistantMessages, c.createdAt, c.updatedAt FROM c WHERE c.type = @type ORDER BY c.totalCostUSD DESC',
      parameters: [{ name: '@type', value: 'usageSummary' }],
    };

    const whereRange = rangeInfo.startIso ? ' AND c.createdAt >= @start' : '';
    const rangeParams = rangeInfo.startIso
      ? [{ name: '@start', value: rangeInfo.startIso }]
      : [];

    const eventsQuery = {
      query: `SELECT TOP 200 c.userId, c.conversationId, c.assistantMessageIndex, c.modelId, c.pricingModelId, c.priced, c.inputTokens, c.outputTokens, c.totalCostUSD, c.createdAt FROM c WHERE c.type = @type${whereRange} ORDER BY c.createdAt DESC`,
      parameters: [{ name: '@type', value: 'usageEvent' }, ...rangeParams],
    };

    // Use only the simplest Cosmos queries (no SUM/GROUP BY/IIF) for maximum compatibility.
    // Compute aggregates in Node from the returned events list.
    const [summariesResp, eventsResp] = await Promise.all([
      container.items.query(summariesQuery).fetchAll(),
      container.items.query(eventsQuery).fetchAll(),
    ]);

    const summaries = summariesResp.resources;
    const eventsRaw = eventsResp.resources;

    const summariesRU = getRequestChargeRU(summariesResp.headers);
    const eventsRU = getRequestChargeRU(eventsResp.headers);

    const events = (eventsRaw ?? []) as DashboardUsageEvent[];

    const totals: DashboardUsageTotals = {
      totalCostUSD: 0,
      inputTokens: 0,
      outputTokens: 0,
      assistantMessages: 0,
      pricedAssistantMessages: 0,
    };

    const byDayMap = new Map<string, DashboardUsageByDayRow>();
    const byModelMap = new Map<string, DashboardUsageByModelRow>();
    const byUserMap = new Map<string, DashboardUsageByUserRow>();

    for (const e of events) {
      totals.totalCostUSD += Number(e.totalCostUSD ?? 0);
      totals.inputTokens += Number(e.inputTokens ?? 0);
      totals.outputTokens += Number(e.outputTokens ?? 0);
      totals.assistantMessages += 1;
      if (e.priced) totals.pricedAssistantMessages += 1;

      const day =
        typeof e.createdAt === 'string' ? e.createdAt.slice(0, 10) : '';
      if (day) {
        const existing = byDayMap.get(day) ?? {
          day,
          totalCostUSD: 0,
          inputTokens: 0,
          outputTokens: 0,
          assistantMessages: 0,
        };
        existing.totalCostUSD += Number(e.totalCostUSD ?? 0);
        existing.inputTokens += Number(e.inputTokens ?? 0);
        existing.outputTokens += Number(e.outputTokens ?? 0);
        existing.assistantMessages += 1;
        byDayMap.set(day, existing);
      }

      const model = (e.pricingModelId ?? e.modelId ?? 'unknown').toString();
      const existingModel = byModelMap.get(model) ?? {
        model,
        totalCostUSD: 0,
        inputTokens: 0,
        outputTokens: 0,
        assistantMessages: 0,
        pricedAssistantMessages: 0,
      };
      existingModel.totalCostUSD += Number(e.totalCostUSD ?? 0);
      existingModel.inputTokens += Number(e.inputTokens ?? 0);
      existingModel.outputTokens += Number(e.outputTokens ?? 0);
      existingModel.assistantMessages += 1;
      if (e.priced) existingModel.pricedAssistantMessages += 1;
      byModelMap.set(model, existingModel);

      const userId = (e.userId ?? 'anonymous').toString();
      const existingUser = byUserMap.get(userId) ?? {
        userId,
        totalCostUSD: 0,
        inputTokens: 0,
        outputTokens: 0,
        assistantMessages: 0,
      };
      existingUser.totalCostUSD += Number(e.totalCostUSD ?? 0);
      existingUser.inputTokens += Number(e.inputTokens ?? 0);
      existingUser.outputTokens += Number(e.outputTokens ?? 0);
      existingUser.assistantMessages += 1;
      byUserMap.set(userId, existingUser);
    }

    const byDay = [...byDayMap.values()]
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, 60);

    const byModel = [...byModelMap.values()]
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 50);

    const topUsers = [...byUserMap.values()]
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 50);

    res.status(200).json({
      range: rangeInfo.range,
      summaries: (summaries ?? []) as DashboardUsageSummary[],
      events,
      totals,
      byDay,
      byModel,
      topUsers,
      requestChargeRU: {
        summaries: summariesRU,
        events: eventsRU,
        total: summariesRU + eventsRU,
      },
    });
  } catch (e: any) {
    const statusCode =
      typeof e?.statusCode === 'number'
        ? e.statusCode
        : typeof e?.code === 'number'
        ? e.code
        : 500;

    if (statusCode >= 500) {
      console.warn('[dashboard/usage] Failed', {
        statusCode,
        message: e?.message,
        code: e?.code,
        cosmosStatusCode: e?.statusCode,
      });
    }
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal Server Error' : e.message,
    });
  }
}

function getRequestChargeRU(headers: any): number {
  const raw =
    headers?.get?.('x-ms-request-charge') ??
    headers?.get?.('X-MS-REQUEST-CHARGE') ??
    headers?.['x-ms-request-charge'] ??
    headers?.['X-MS-REQUEST-CHARGE'];

  const value = typeof raw === 'string' ? raw : String(raw ?? '');
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
