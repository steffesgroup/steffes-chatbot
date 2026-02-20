import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

import type {
  DashboardChatItem,
  DashboardChatsResponse,
} from './api/dashboard/chats';
import type {
  DashboardUsageEvent,
  DashboardUsageResponse,
  DashboardUsageSummary,
  DashboardUsageByDayRow,
  DashboardUsageByModelRow,
  DashboardUsageByUserRow,
  DashboardUsageTotals,
} from './api/dashboard/usage';

import type {
  DashboardTopicRow,
  DashboardTopicsResponse,
} from './api/dashboard/topics';

type DashboardRange = '24h' | '7d' | '30d' | 'all';

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summaries, setSummaries] = useState<DashboardUsageSummary[]>([]);
  const [events, setEvents] = useState<DashboardUsageEvent[]>([]);
  const [chats, setChats] = useState<DashboardChatItem[]>([]);
  const [totals, setTotals] = useState<DashboardUsageTotals | null>(null);
  const [byDay, setByDay] = useState<DashboardUsageByDayRow[]>([]);
  const [byModel, setByModel] = useState<DashboardUsageByModelRow[]>([]);
  const [topUsers, setTopUsers] = useState<DashboardUsageByUserRow[]>([]);
  const [topics, setTopics] = useState<DashboardTopicRow[]>([]);
  const [expandedTopicKeywords, setExpandedTopicKeywords] = useState<
    Set<string>
  >(() => new Set());

  const toggleTopicKeywordExpanded = (keyword: string) => {
    setExpandedTopicKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const range: DashboardRange = useMemo(() => {
    const q = router.query.range;
    if (q === '24h' || q === '7d' || q === '30d' || q === 'all') return q;
    return '7d';
  }, [router.query.range]);

  useEffect(() => {
    let cancelled = false;

    // Reset any expanded sample questions when changing the time range.
    setExpandedTopicKeywords(new Set());

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [usageRes, chatsRes] = await Promise.all([
          fetch(`/api/dashboard/usage?range=${encodeURIComponent(range)}`),
          fetch(`/api/dashboard/chats?range=${encodeURIComponent(range)}`),
        ]);

        if (!usageRes.ok) {
          throw new Error(`Usage API error (${usageRes.status})`);
        }
        if (!chatsRes.ok) {
          throw new Error(`Chats API error (${chatsRes.status})`);
        }

        const usageJson = (await usageRes.json()) as DashboardUsageResponse;
        const chatsJson = (await chatsRes.json()) as DashboardChatsResponse;

        const topicsRes = await fetch(
          `/api/dashboard/topics?range=${encodeURIComponent(range)}`,
        );
        if (!topicsRes.ok) {
          throw new Error(`Topics API error (${topicsRes.status})`);
        }
        const topicsJson = (await topicsRes.json()) as DashboardTopicsResponse;

        if (cancelled) return;

        setSummaries(usageJson.summaries ?? []);
        setEvents(usageJson.events ?? []);
        setTotals(usageJson.totals ?? null);
        setByDay(usageJson.byDay ?? []);
        setByModel(usageJson.byModel ?? []);
        setTopUsers(usageJson.topUsers ?? []);
        setChats(chatsJson.chats ?? []);
        setTopics(topicsJson.topics ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range]);

  const rangeLabel =
    range === '24h'
      ? 'Last 24 hours'
      : range === '7d'
      ? 'Last 7 days'
      : range === '30d'
      ? 'Last 30 days'
      : 'All time';

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-300">
              Reads from Cosmos via admin-only API routes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300" htmlFor="range">
              Range
            </label>
            <select
              id="range"
              value={range}
              onChange={(e) => {
                const next = e.target.value as DashboardRange;
                router.push(
                  {
                    pathname: router.pathname,
                    query: { ...router.query, range: next },
                  },
                  undefined,
                  { shallow: true },
                );
              }}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100"
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="all">All-time</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 text-gray-300">Loading…</div>
        ) : error ? (
          <div className="mt-6 rounded bg-red-900/40 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <section>
              <h2 className="text-lg font-semibold">Totals ({rangeLabel})</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Total Cost (USD)</th>
                      <th className="px-3 py-2">Input Tokens</th>
                      <th className="px-3 py-2">Output Tokens</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                      <th className="px-3 py-2">Priced Msgs</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-gray-100">
                      <td className="px-3 py-2">
                        {(totals?.totalCostUSD ?? 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2">{totals?.inputTokens ?? 0}</td>
                      <td className="px-3 py-2">{totals?.outputTokens ?? 0}</td>
                      <td className="px-3 py-2">
                        {totals?.assistantMessages ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        {totals?.pricedAssistantMessages ?? 0}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">
                Daily Usage (latest 60 days)
              </h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Day</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tokens (in/out)</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {byDay.map((d) => (
                      <tr key={d.day} className="text-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">{d.day}</td>
                        <td className="px-3 py-2">
                          {Number(d.totalCostUSD ?? 0).toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {d.inputTokens}/{d.outputTokens}
                        </td>
                        <td className="px-3 py-2">{d.assistantMessages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">
                Cost by Model ({rangeLabel})
              </h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tokens (in/out)</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                      <th className="px-3 py-2">Priced Msgs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {byModel.map((m) => (
                      <tr key={m.model} className="text-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.model ?? 'unknown'}
                        </td>
                        <td className="px-3 py-2">
                          {Number(m.totalCostUSD ?? 0).toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {m.inputTokens}/{m.outputTokens}
                        </td>
                        <td className="px-3 py-2">{m.assistantMessages}</td>
                        <td className="px-3 py-2">
                          {m.pricedAssistantMessages}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">
                Top Users ({rangeLabel})
              </h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tokens (in/out)</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {topUsers.map((u) => (
                      <tr key={u.userId} className="text-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {u.userId}
                        </td>
                        <td className="px-3 py-2">
                          {Number(u.totalCostUSD ?? 0).toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {u.inputTokens}/{u.outputTokens}
                        </td>
                        <td className="px-3 py-2">{u.assistantMessages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">
                Top Keywords ({rangeLabel})
              </h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Keyword</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Last Seen</th>
                      <th className="px-3 py-2">Sample Question</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {topics.map((t) => {
                      const keyword = t.keyword;
                      const sampleQuestion = t.sampleQuestion ?? '';
                      const isExpanded = expandedTopicKeywords.has(keyword);
                      const maxLen = 50;
                      const isTruncatable = sampleQuestion.length > maxLen;

                      return (
                        <tr key={keyword} className="align-top text-gray-100">
                          <td className="px-3 py-2 font-mono text-xs">
                            {keyword}
                          </td>
                          <td className="px-3 py-2">{t.count}</td>
                          <td className="px-3 py-2 text-xs text-gray-300">
                            {t.lastSeenAt}
                          </td>
                          <td className="max-w-md px-3 py-2 text-gray-200">
                            {sampleQuestion ? (
                              isExpanded || !isTruncatable ? (
                                <div className="space-y-1">
                                  <div className="whitespace-pre-wrap break-words">
                                    {sampleQuestion}
                                  </div>
                                  {isTruncatable ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleTopicKeywordExpanded(keyword)
                                      }
                                      className="text-xs text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-500"
                                    >
                                      Hide
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="min-w-0 flex-1 whitespace-pre-wrap">
                                    {sampleQuestion.slice(0, maxLen)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTopicKeywordExpanded(keyword)
                                    }
                                    aria-expanded={false}
                                    aria-label="Show full sample question"
                                    className="shrink-0 text-xs text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-500"
                                  >
                                    …
                                  </button>
                                </div>
                              )
                            ) : (
                              ''
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">
                Usage Summaries (all-time)
              </h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Total Cost (USD)</th>
                      <th className="px-3 py-2">Input Tokens</th>
                      <th className="px-3 py-2">Output Tokens</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                      <th className="px-3 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {summaries.map((s) => (
                      <tr key={s.userId} className="text-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {s.userId}
                        </td>
                        <td className="px-3 py-2">
                          {s.totalCostUSD.toFixed(4)}
                        </td>
                        <td className="px-3 py-2">{s.totalInputTokens}</td>
                        <td className="px-3 py-2">{s.totalOutputTokens}</td>
                        <td className="px-3 py-2">
                          {s.totalAssistantMessages}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {s.updatedAt ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Recent Usage Events</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Conversation</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tokens (in/out)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {events.slice(0, 50).map((e) => (
                      <tr
                        key={`${e.userId}|${e.conversationId}|${e.assistantMessageIndex}`}
                        className="text-gray-100"
                      >
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {e.createdAt}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {e.userId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {e.conversationId}
                        </td>
                        <td className="px-3 py-2">
                          {e.pricingModelId ?? e.modelId ?? ''}
                        </td>
                        <td className="px-3 py-2">
                          {e.totalCostUSD.toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {e.inputTokens}/{e.outputTokens}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Recent Chats</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2">Answer (snippet)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {chats.slice(0, 50).map((c) => (
                      <tr key={c.id} className="align-top text-gray-100">
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {c.createdAt}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">
                            {c.userId ?? 'unknown'}
                          </div>
                          <div className="text-xs text-gray-300">
                            {c.userName ?? ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {c.modelName ?? c.modelId ?? ''}
                        </td>
                        <td className="max-w-md whitespace-pre-wrap px-3 py-2">
                          {c.question}
                        </td>
                        <td className="max-w-md whitespace-pre-wrap px-3 py-2 text-gray-200">
                          {c.answerSnippet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
