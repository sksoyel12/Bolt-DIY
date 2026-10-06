import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { scrapeUrl, searchWeb, WebResearchError } from '~/lib/.server/web-research';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { url, query } = (await request.json()) as { url?: string; query?: string };
    const runtimeEnv = typeof process !== 'undefined' ? process.env : {};
    const serverEnv = {
      ...runtimeEnv,
      ...(((context as any)?.cloudflare?.env || {}) as Record<string, string | undefined>),
    };
    const input = (url || query || '').trim();

    if (!input) {
      return json({ error: 'A URL or search query is required' }, { status: 400 });
    }

    const isUrl = /^https?:\/\//i.test(input);
    const data = isUrl ? await scrapeUrl(input) : await searchWeb(input, serverEnv);

    return json({
      success: true,
      data,
    });
  } catch (error) {
    const status = error instanceof WebResearchError ? error.statusCode : 500;
    return json({ error: error instanceof Error ? error.message : 'Web research request failed' }, { status });
  }
}
