import { tool } from 'ai';
import { z } from 'zod';
import { scrapeUrl, searchWeb } from '~/lib/.server/web-research';

export function createWebResearchTools(env: Record<string, string | undefined>, webSearchEnabled: boolean) {
  const inspectUrlTool = {
    inspect_url: tool({
      description:
        'Fetch and inspect a public webpage or raw text/code URL. Use this when the user asks to analyze, summarize, or inspect a link. Returns clean plain text, readable Markdown, and page metadata.',
      parameters: z.object({
        url: z.string().url().max(2048).describe('Public HTTP or HTTPS webpage or raw source URL'),
      }),
      execute: async ({ url }) => {
        const page = await scrapeUrl(url, { maxTextChars: 12_000, maxHtmlChars: 10_000 });

        return {
          title: page.title,
          description: page.description,
          sourceUrl: page.sourceUrl,
          kind: page.kind,
          metadata: page.metadata,
          markdown: page.markdown,
          text: page.text,
        };
      },
    }),
  };

  if (!webSearchEnabled) {
    return inspectUrlTool;
  }

  return {
    web_search: tool({
      description:
        'Search the live web for current documentation, package information, recent events, or other time-sensitive facts. Use this before answering questions that may have changed.',
      parameters: z.object({
        query: z.string().trim().min(2).max(500).describe('A focused live web search query'),
      }),
      execute: async ({ query }) => searchWeb(query, env),
    }),
    ...inspectUrlTool,
  };
}
