import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrapeUrl, searchWeb, WebResearchError } from './web-research';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web research extraction', () => {
  it('extracts clean plain text and structured Markdown from an HTML page', async () => {
    const html = `<!doctype html>
      <html><head><title>Example guide</title><meta name="description" content="A useful guide"></head>
      <body><nav>Navigation noise</nav><main>
        <h1>Getting started</h1>
        <p>Read the <strong>guide</strong> at <a href="/docs">the docs</a>.</p>
        <ul><li>Install the package</li><li>Run the app</li></ul>
        <pre><code class="language-js">if (ready) {
  console.log('ready');
}</code></pre>
      </main><footer>Footer noise</footer></body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );

    const result = await scrapeUrl('https://example.com/guide');

    expect(result.title).toBe('Example guide');
    expect(result.text).toContain('Getting started');
    expect(result.text).not.toContain('Navigation noise');
    expect(result.text).not.toContain('Footer noise');
    expect(result.markdown).toContain('# Getting started');
    expect(result.markdown).toContain('**guide**');
    expect(result.markdown).toContain('[the docs](https://example.com/docs)');
    expect(result.markdown).toContain('- Install the package');
    expect(result.markdown).toContain('```js');
    expect(result.markdown).toContain("  console.log('ready');");
    expect(result.content).toBe(result.markdown);
  });

  it('rejects private URLs before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(scrapeUrl('http://127.0.0.1/admin')).rejects.toBeInstanceOf(WebResearchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns search results as Markdown suitable for model context', async () => {
    const html = `<div class="result">
      <a class="result__a" href="https://docs.example.com/setup">Setup docs</a>
      <a class="result__snippet">Install and configure the package.</a>
    </div>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })),
    );

    const result = await searchWeb('package setup');

    expect(result.kind).toBe('search');
    expect(result.results?.[0]?.url).toBe('https://docs.example.com/setup');
    expect(result.markdown).toContain('### 1. [Setup docs](https://docs.example.com/setup)');
    expect(result.content).toBe(result.markdown);
  });
});
