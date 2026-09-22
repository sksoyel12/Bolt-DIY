import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { isAllowedUrl } from '~/utils/url';

const MAX_CONTENT_LENGTH = 8000;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);

  if (match) {
    return match[1].trim();
  }

  // Try reverse attribute order
  const altMatch = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  return altMatch ? altMatch[1].trim() : '';
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { url, query } = (await request.json()) as { url?: string; query?: string };
    const serverEnv = ((context as any)?.cloudflare?.env || {}) as Record<string, string>;
    const input = (url || query || '').trim();

    if (!input) {
      return json({ error: 'A URL or search query is required' }, { status: 400 });
    }

    const isUrl = /^https?:\/\//i.test(input);

    if (!isUrl) {
      const tavilyApiKey = serverEnv.TAVILY_API_KEY;

      if (!tavilyApiKey) {
        return json({ error: 'Search is not configured on the server' }, { status: 503 });
      }

      const tavilyResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: input,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tavilyResponse.ok) {
        return json({ error: `Tavily search failed: ${tavilyResponse.status}` }, { status: 502 });
      }

      const tavilyData = (await tavilyResponse.json()) as {
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const results = tavilyData.results || [];
      const content = results
        .map((result) => `${result.title || 'Result'}\n${result.url || ''}\n${result.content || ''}`)
        .join('\n\n');

      return json({
        success: true,
        data: {
          title: `Search results for "${input}"`,
          description: tavilyData.answer || '',
          content: content.length > MAX_CONTENT_LENGTH ? `${content.slice(0, MAX_CONTENT_LENGTH)}...` : content,
          sourceUrl: `tavily:${input}`,
        },
      });
    }

    if (!isAllowedUrl(input)) {
      return json({ error: 'URL is not allowed. Only public HTTP/HTTPS URLs are accepted.' }, { status: 400 });
    }

    const firecrawlApiKey = serverEnv.FIRECRAWL_API_KEY;

    if (firecrawlApiKey) {
      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: input, formats: ['markdown'] }),
        signal: AbortSignal.timeout(20_000),
      });

      if (firecrawlResponse.ok) {
        const firecrawlData = (await firecrawlResponse.json()) as {
          success?: boolean;
          data?: { markdown?: string; title?: string; description?: string };
        };
        const data = firecrawlData.data;

        if (firecrawlData.success !== false && data) {
          const content = data.markdown || '';

          return json({
            success: true,
            data: {
              title: data.title || '',
              description: data.description || '',
              content: content.length > MAX_CONTENT_LENGTH ? `${content.slice(0, MAX_CONTENT_LENGTH)}...` : content,
              sourceUrl: input,
            },
          });
        }
      }
    }

    const response = await fetch(input, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return json({ error: 'URL must point to an HTML or text page' }, { status: 400 });
    }

    const html = await response.text();
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extractTextContent(html);

    return json({
      success: true,
      data: {
        title,
        description,
        content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
        sourceUrl: input,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'Request timed out after 10 seconds' }, { status: 504 });
    }

    console.error('Web search error:', error);

    return json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}
