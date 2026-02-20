import type { NextApiRequest, NextApiResponse } from 'next';

import { ChatLogger } from '../../../steffes-packages/chat-logger';
import { parseDashboardRange } from '../../../utils/server/dashboardRange';
import { requireSwaRole } from '../../../utils/server/identity';

const chatLogger = new ChatLogger();

export type DashboardChatItem = {
  id: string;
  createdAt: string;
  userName?: string;
  userId?: string;
  identityProvider?: string;
  modelId?: string;
  modelName?: string;
  question: string;
  answerSnippet: string;
};

export type DashboardChatsResponse = {
  chats: DashboardChatItem[];
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
  res: NextApiResponse<DashboardChatsResponse | { error: string }>,
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

    requireSwaRole(headers, 'admin');

    const container = (await chatLogger.containerResponsePromise).container;

    // Chat docs don’t have a `type` or `createdAt`; use `_ts` and the presence of `questionAnswerTuple`.
    const whereRange =
      typeof rangeInfo.minTsSeconds === 'number' ? ' AND c._ts >= @minTs' : '';
    const rangeParams =
      typeof rangeInfo.minTsSeconds === 'number'
        ? [{ name: '@minTs', value: rangeInfo.minTsSeconds }]
        : [];

    const query = {
      query: `SELECT TOP 100 c.id, c.questionAnswerTuple, c._ts FROM c WHERE IS_DEFINED(c.questionAnswerTuple)${whereRange} ORDER BY c._ts DESC`,
      parameters: rangeParams,
    };

    const { resources } = await container.items.query(query).fetchAll();

    const chats: DashboardChatItem[] = (resources ?? [])
      .map((doc: RawChatDoc) => toDashboardItem(doc))
      .filter(Boolean) as DashboardChatItem[];

    res.status(200).json({ chats });
  } catch (e: any) {
    const statusCode =
      typeof e?.statusCode === 'number'
        ? e.statusCode
        : typeof e?.code === 'number'
        ? e.code
        : 500;

    if (statusCode >= 500) {
      console.warn('[dashboard/chats] Failed', {
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

function toDashboardItem(doc: RawChatDoc): DashboardChatItem | null {
  if (!doc?.id || !Array.isArray(doc.questionAnswerTuple)) return null;

  const qa = doc.questionAnswerTuple;
  const user = qa.find((x) => x?.who?.kind === 'user');
  const llm = qa.find((x) => x?.who?.kind === 'llm');

  const question = typeof user?.message === 'string' ? user.message : '';
  const answer = typeof llm?.message === 'string' ? llm.message : '';

  const userInfo = user?.who?.info;
  const llmInfo = llm?.who?.info;

  const tsSeconds = typeof doc._ts === 'number' ? doc._ts : undefined;
  const createdAt = tsSeconds
    ? new Date(tsSeconds * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: doc.id,
    createdAt,
    userName:
      typeof userInfo?.userName === 'string' ? userInfo.userName : undefined,
    userId: typeof userInfo?.userId === 'string' ? userInfo.userId : undefined,
    identityProvider:
      typeof userInfo?.identityProvider === 'string'
        ? userInfo.identityProvider
        : undefined,
    modelId: typeof llmInfo?.id === 'string' ? llmInfo.id : undefined,
    modelName: typeof llmInfo?.name === 'string' ? llmInfo.name : undefined,
    question,
    answerSnippet: answer.slice(0, 500),
  };
}
