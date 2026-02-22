import type { NextApiRequest, NextApiResponse } from 'next';

import { hasRole } from '../../../utils/server/identity';

export type MeResponse = {
  isAdmin: boolean;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse>,
) {
  const headers = new Headers(req.headers as Record<string, string>);
  res.status(200).json({ isAdmin: hasRole(headers, 'admin') });
}
