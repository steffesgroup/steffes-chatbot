import { getPublicModelsFromEnv } from '@/utils/server/llmModels';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  try {
    return new Response(JSON.stringify(getPublicModelsFromEnv()), {
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response('Error', { status: 500 });
  }
};

export default handler;
