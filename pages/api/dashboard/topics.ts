import type { NextApiRequest, NextApiResponse } from 'next';

import { ChatLogger } from '../../../steffes-packages/chat-logger';
import { parseDashboardRange } from '../../../utils/server/dashboardRange';
import { requireSwaRole } from '../../../utils/server/identity';

const chatLogger = new ChatLogger();

export type DashboardTopicRow = {
  keyword: string;
  count: number;
  lastSeenAt: string;
  sampleQuestion?: string;
  sampleChatId?: string;
};

export type DashboardTopicsResponse = {
  range: '24h' | '7d' | '30d' | 'all';
  topics: DashboardTopicRow[];
  requestChargeRU: number;
};

type RawChatDoc = {
  id: string;
  _ts?: number;
  questionAnswerTuple?: Array<{
    who?: { kind?: string; info?: any };
    message?: string;
  }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardTopicsResponse | { error: string }>,
) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const rangeInfo = parseDashboardRange(req.query.range);

    // Convert Next headers object into Web Headers for shared SWA parser.
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(','));
    }

    requireSwaRole(headers, 'admin');

    const container = (await chatLogger.containerResponsePromise).container;

    const whereRange =
      typeof rangeInfo.minTsSeconds === 'number' ? ' AND c._ts >= @minTs' : '';
    const rangeParams =
      typeof rangeInfo.minTsSeconds === 'number'
        ? [{ name: '@minTs', value: rangeInfo.minTsSeconds }]
        : [];

    // Pull a bounded slice of recent chats and compute keywords server-side.
    // (We intentionally avoid any extra persisted fields.)
    const query = {
      query: `SELECT TOP 500 c.id, c.questionAnswerTuple, c._ts FROM c WHERE IS_DEFINED(c.questionAnswerTuple)${whereRange} ORDER BY c._ts DESC`,
      parameters: rangeParams,
    };

    const resp = await container.items.query(query).fetchAll();
    const resources = resp.resources;
    const requestChargeRU = getRequestChargeRU(resp.headers);

    const rows = computeTopics((resources ?? []) as RawChatDoc[]);

    res.status(200).json({
      range: rangeInfo.range,
      topics: rows,
      requestChargeRU,
    });
  } catch (e: any) {
    const statusCode =
      typeof e?.statusCode === 'number'
        ? e.statusCode
        : typeof e?.code === 'number'
        ? e.code
        : 500;

    if (statusCode >= 500) {
      console.warn('[dashboard/topics] Failed', {
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

function computeTopics(docs: RawChatDoc[]): DashboardTopicRow[] {
  const counts = new Map<
    string,
    {
      count: number;
      lastTsSeconds: number;
      candidates: Array<{
        chatId: string;
        tsSeconds: number;
        question: string;
      }>;
    }
  >();

  for (const doc of docs) {
    const tsSeconds = typeof doc?._ts === 'number' ? doc._ts : undefined;
    const question = extractUserQuestion(doc);
    if (!question) continue;

    const tokens = extractKeywords(question);

    for (const keyword of tokens) {
      const existing = counts.get(keyword);
      if (!existing) {
        counts.set(keyword, {
          count: 1,
          lastTsSeconds: tsSeconds ?? 0,
          candidates: [
            {
              chatId: doc.id,
              tsSeconds: tsSeconds ?? 0,
              question,
            },
          ],
        });
      } else {
        existing.count += 1;

        if (
          typeof tsSeconds === 'number' &&
          tsSeconds > existing.lastTsSeconds
        ) {
          existing.lastTsSeconds = tsSeconds;
        }

        // Track a few candidate samples per keyword so we can pick different
        // sample questions across rows (avoids the same message repeating).
        if (!existing.candidates.some((c) => c.chatId === doc.id)) {
          existing.candidates.push({
            chatId: doc.id,
            tsSeconds: tsSeconds ?? 0,
            question,
          });

          existing.candidates.sort((a, b) => b.tsSeconds - a.tsSeconds);
          if (existing.candidates.length > 5) {
            existing.candidates.length = 5;
          }
        }
      }
    }
  }

  const usedSampleChatIds = new Set<string>();

  const rows: DashboardTopicRow[] = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([keyword, info]) => {
      const candidate =
        info.candidates.find((c) => !usedSampleChatIds.has(c.chatId)) ??
        info.candidates[0];

      if (candidate?.chatId) usedSampleChatIds.add(candidate.chatId);

      return {
        keyword,
        count: info.count,
        lastSeenAt: info.lastTsSeconds
          ? new Date(info.lastTsSeconds * 1000).toISOString()
          : new Date().toISOString(),
        sampleQuestion: candidate?.question,
        sampleChatId: candidate?.chatId,
      };
    });

  return rows;
}

function extractUserQuestion(doc: RawChatDoc): string {
  const qa = Array.isArray(doc.questionAnswerTuple)
    ? doc.questionAnswerTuple
    : [];
  const user = qa.find((x) => x?.who?.kind === 'user');
  const question = typeof user?.message === 'string' ? user.message.trim() : '';
  return question;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'have',
  'has',
  'had',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'show',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'this',
  'to',
  'up',
  'us',
  'was',
  'we',
  'what',
  'when',
  'where',
  'which',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

function extractKeywords(text: string): string[] {
  // Keep it intentionally simple: lowercase, split on non-letters/numbers, drop stopwords.
  // Avoid NLP libraries to keep bundle light.
  const parts = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const keywords: string[] = [];
  for (const p of parts) {
    if (p.length < 3) continue;
    if (STOPWORDS.has(p)) continue;
    if (/^\d+$/.test(p)) continue;
    keywords.push(p);
  }

  // De-dup within a single question to avoid overcounting repeated words.
  return [...new Set(keywords)];
}
