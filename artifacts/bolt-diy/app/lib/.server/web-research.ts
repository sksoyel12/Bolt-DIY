import { load } from 'cheerio';
import { isAllowedUrl } from '~/utils/url';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebResearchData {
  title: string;
  description: string;
  content: string;
  markdown?: string;
  sourceUrl: string;
  kind?: 'search' | 'html' | 'source';
  text?: string;
  html?: string;
  source?: string;
  metadata?: Record<string, string>;
  results?: SearchResult[];
}

export class WebResearchError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'WebResearchError';
  }
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8',
};

const MAX_PAGE_BYTES = 512 * 1024;
const MAX_SEARCH_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 24_000;
const MAX_HTML_CHARS = 200_000;

interface HtmlNode {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: HtmlNode[];
}

function safeMarkdownLink(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) {
    return undefined;
  }

  try {
    const url = new URL(href, baseUrl);

    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function renderMarkdownNode(node: HtmlNode, baseUrl: string, inPreformattedBlock = false): string {
  if (node.type === 'text') {
    return inPreformattedBlock ? node.data || '' : (node.data || '').replace(/\s+/g, ' ');
  }

  const tag = (node.name || '').toLowerCase();

  if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'svg') {
    return '';
  }

  if (tag === 'br') {
    return '\n';
  }

  if (tag === 'hr') {
    return '\n\n---\n\n';
  }

  if (tag === 'img') {
    const src = safeMarkdownLink(node.attribs?.src, baseUrl);
    const alt = node.attribs?.alt?.trim();

    return src && alt ? `![${alt}](${src.replace(/\)/g, '%29')})` : '';
  }

  if (!node.children) {
    return '';
  }

  const isPreformatted = inPreformattedBlock || tag === 'pre';
  const inner = node.children.map((child) => renderMarkdownNode(child, baseUrl, isPreformatted)).join('');
  const trimmed = inner.trim();
  const block = (value: string) => (value ? `\n\n${value}\n\n` : '');

  if (/^h[1-6]$/.test(tag)) {
    return block(`${'#'.repeat(Number(tag[1]))} ${trimmed}`);
  }

  if (tag === 'p' || tag === 'article' || tag === 'section' || tag === 'div') {
    return block(trimmed);
  }

  if (tag === 'li') {
    return `\n- ${trimmed}`;
  }

  if (tag === 'ul' || tag === 'ol') {
    return block(inner.trim());
  }

  if (tag === 'blockquote') {
    return block(
      trimmed
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n'),
    );
  }

  if (tag === 'pre') {
    const fence = '`'.repeat(Math.max(3, ...Array.from(trimmed.matchAll(/`+/g), ([match]) => match.length + 1)));
    const language = node.children
      .find((child) => child.type === 'tag' && child.name === 'code')
      ?.attribs?.class?.match(/(?:language|lang)-([a-z0-9_-]+)/i)?.[1];

    return block(`${fence}${language || ''}\n${trimmed}\n${fence}`);
  }

  if (tag === 'code') {
    return inPreformattedBlock ? inner : `\`${trimmed.replace(/`/g, '\\`')}\``;
  }

  if (tag === 'strong' || tag === 'b') {
    return `**${trimmed}**`;
  }

  if (tag === 'em' || tag === 'i') {
    return `*${trimmed}*`;
  }

  if (tag === 'del' || tag === 's') {
    return `~~${trimmed}~~`;
  }

  if (tag === 'a') {
    const href = safeMarkdownLink(node.attribs?.href, baseUrl);

    return href && trimmed ? `[${trimmed}](${href.replace(/\)/g, '%29')})` : trimmed;
  }

  return inner;
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  const advertisedLength = Number(response.headers.get('content-length') || 0);

  if (advertisedLength > limit) {
    throw new WebResearchError(`The response exceeds the ${Math.round(limit / 1024)} KB size limit.`, 413);
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > limit) {
        await reader.cancel();
        throw new WebResearchError(`The response exceeds the ${Math.round(limit / 1024)} KB size limit.`, 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function fetchPublicPage(input: string): Promise<Response> {
  let currentUrl: URL;

  try {
    currentUrl = new URL(input);
  } catch {
    throw new WebResearchError('Enter a valid public HTTP or HTTPS URL.', 400);
  }

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isAllowedUrl(currentUrl.href)) {
      throw new WebResearchError('Only public HTTP/HTTPS URLs are accepted.', 400);
    }

    let response: Response;

    try {
      response = await fetch(currentUrl, {
        headers: REQUEST_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new WebResearchError('The page request timed out.', 504);
      }

      throw error;
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get('location');

    if (!location || redirects === 3) {
      throw new WebResearchError('The page redirected too many times.', 502);
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new WebResearchError('The page redirected too many times.', 502);
}

function decodeSearchResultUrl(href: string): string {
  try {
    const resultUrl = new URL(href, 'https://duckduckgo.com');
    const destination = resultUrl.searchParams.get('uddg');

    return destination ? new URL(destination).href : resultUrl.href;
  } catch {
    return href;
  }
}

async function searchDuckDuckGo(query: string): Promise<WebResearchData> {
  const searchUrl = new URL('https://html.duckduckgo.com/html/');
  searchUrl.searchParams.set('q', query);

  const response = await fetch(searchUrl, {
    headers: {
      ...REQUEST_HEADERS,
      Accept: 'text/html',
      Referer: 'https://duckduckgo.com/',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new WebResearchError(`DuckDuckGo search failed with status ${response.status}.`, 502);
  }

  const html = await readLimitedText(response, MAX_SEARCH_BYTES);
  const $ = load(html);
  const results: SearchResult[] = $('.result')
    .toArray()
    .map((element) => {
      const result = $(element);
      const link = result.find('.result__a').first();

      return {
        title: link.text().trim(),
        url: decodeSearchResultUrl(link.attr('href') || ''),
        snippet: result.find('.result__snippet').first().text().trim(),
      };
    })
    .filter((result) => result.title && /^https?:\/\//i.test(result.url))
    .slice(0, 5);

  if (results.length === 0) {
    throw new WebResearchError('DuckDuckGo did not return any readable results for that query.', 502);
  }

  const markdown = results
    .map((result, index) => `### ${index + 1}. [${result.title}](${result.url})\n\n${result.snippet}`)
    .join('\n\n');
  const text = results
    .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`)
    .join('\n\n');

  return {
    title: `Web search: ${query}`,
    description: '',
    content: markdown.slice(0, MAX_TEXT_CHARS),
    markdown: markdown.slice(0, MAX_TEXT_CHARS),
    text: text.slice(0, MAX_TEXT_CHARS),
    sourceUrl: searchUrl.href,
    kind: 'search',
    results,
  };
}

async function searchTavily(query: string, apiKey: string): Promise<WebResearchData> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new WebResearchError(`Tavily search failed with status ${response.status}.`, 502);
  }

  const data = (await response.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const results = (data.results || [])
    .filter((result) => result.url && /^https?:\/\//i.test(result.url))
    .slice(0, 5)
    .map((result) => ({
      title: result.title || 'Search result',
      url: result.url!,
      snippet: result.content || '',
    }));

  if (results.length === 0) {
    throw new WebResearchError('Tavily did not return any results for that query.', 502);
  }

  const markdown = [
    data.answer ? `## Search summary\n\n${data.answer}` : '',
    ...results.map((result, index) => `### ${index + 1}. [${result.title}](${result.url})\n\n${result.snippet}`),
  ]
    .filter(Boolean)
    .join('\n\n');
  const text = [
    data.answer || '',
    ...results.map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    title: `Web search: ${query}`,
    description: data.answer || '',
    content: markdown.slice(0, MAX_TEXT_CHARS),
    markdown: markdown.slice(0, MAX_TEXT_CHARS),
    text: text.slice(0, MAX_TEXT_CHARS),
    sourceUrl: 'Tavily web search',
    kind: 'search',
    results,
  };
}

export async function searchWeb(query: string, env: Record<string, string | undefined> = {}): Promise<WebResearchData> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new WebResearchError('Search queries must contain 1–500 characters.', 400);
  }

  const tavilyApiKey = env.TAVILY_API_KEY;

  if (tavilyApiKey) {
    try {
      return await searchTavily(normalizedQuery, tavilyApiKey);
    } catch {
      // Keep search available without a Tavily key or when its service is unavailable.
    }
  }

  return searchDuckDuckGo(normalizedQuery);
}

export async function scrapeUrl(
  input: string,
  limits: { maxTextChars?: number; maxHtmlChars?: number } = {},
): Promise<WebResearchData> {
  const url = input.trim();

  if (!isAllowedUrl(url)) {
    throw new WebResearchError('Only public HTTP/HTTPS URLs are accepted.', 400);
  }

  const response = await fetchPublicPage(url);

  if (!response.ok) {
    throw new WebResearchError(`The URL returned ${response.status} ${response.statusText}.`, 502);
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const pathname = new URL(url).pathname.toLowerCase();
  const sourceExtension =
    /\.(?:txt|md|mdx|js|jsx|mjs|cjs|ts|tsx|json|yml|yaml|xml|css|scss|py|java|kt|go|rs|sh|html?)$/i.test(pathname);
  const isTextResponse =
    contentType.startsWith('text/') ||
    /^(application\/(json|ld\+json|xml|javascript|x-javascript|xhtml\+xml))$/.test(contentType) ||
    (contentType === 'application/octet-stream' && sourceExtension);

  if (!isTextResponse) {
    throw new WebResearchError('The URL must return a webpage or a text/code file.', 415);
  }

  const source = await readLimitedText(response, MAX_PAGE_BYTES);
  const looksLikeHtml = contentType.includes('html') || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(source);
  const maxTextChars = limits.maxTextChars ?? MAX_TEXT_CHARS;
  const maxHtmlChars = limits.maxHtmlChars ?? MAX_HTML_CHARS;

  if (!looksLikeHtml) {
    return {
      title: new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname,
      description: contentType,
      content: source.slice(0, maxTextChars),
      markdown: source.slice(0, maxTextChars),
      sourceUrl: url,
      kind: 'source',
      text: source.slice(0, maxTextChars),
      source: source.slice(0, MAX_PAGE_BYTES),
      metadata: {
        contentType,
        ...(response.headers.get('last-modified') ? { lastModified: response.headers.get('last-modified')! } : {}),
      },
    };
  }

  const $ = load(source);
  const metadata: Record<string, string> = {};
  const readMeta = (selector: string, attribute: string) => $(selector).first().attr(attribute)?.trim() || '';
  const title =
    $('title').first().text().trim() || readMeta('meta[property="og:title"]', 'content') || new URL(url).hostname;
  const description =
    readMeta('meta[name="description"]', 'content') || readMeta('meta[property="og:description"]', 'content');
  const canonical = $('link[rel="canonical"]').first().attr('href');
  const author = readMeta('meta[name="author"]', 'content');
  const published = readMeta('meta[property="article:published_time"]', 'content');

  if (canonical) {
    metadata.canonical = new URL(canonical, url).href;
  }

  if (author) {
    metadata.author = author;
  }

  if (published) {
    metadata.published = published;
  }

  metadata.contentType = contentType;

  $(
    'script, style, noscript, template, iframe, nav, header, footer, aside, form, svg, ' +
      '[aria-label*="advert" i], [class*="advert" i], [id*="advert" i], [class*="cookie" i], [id*="cookie" i], ' +
      '[class*="sponsor" i], [class*="banner-ad" i]',
  ).remove();

  const text = $('body').text().replace(/\s+/g, ' ').trim() || $.root().text().replace(/\s+/g, ' ').trim();
  const markdown = normalizeMarkdown(
    $('body')
      .contents()
      .toArray()
      .map((node) => renderMarkdownNode(node as unknown as HtmlNode, url))
      .join(''),
  );
  const cleanedHtml = $.html();

  return {
    title,
    description,
    content: (markdown || text).slice(0, maxTextChars),
    markdown: (markdown || text).slice(0, maxTextChars),
    sourceUrl: url,
    kind: 'html',
    text: text.slice(0, maxTextChars),
    html: cleanedHtml.slice(0, maxHtmlChars),
    metadata,
  };
}
