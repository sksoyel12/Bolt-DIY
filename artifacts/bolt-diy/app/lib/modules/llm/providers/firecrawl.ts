import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createAgentLanguageModel } from '~/lib/modules/llm/agent-model';

export default class FirecrawlProvider extends BaseProvider {
  name = 'Firecrawl';

  config = {
    apiTokenKey: 'FIRECRAWL_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'firecrawl-scrape',
      label: 'Firecrawl Web Extraction Agent',
      provider: 'Firecrawl',
      maxTokenAllowed: 32000,
    },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys: options.apiKeys,
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: options.serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'FIRECRAWL_API_KEY',
    });

    return createAgentLanguageModel({
      provider: this.name,
      model: options.model,
      run: async (query) => {
        if (!apiKey) {
          throw new Error('Missing API key for Firecrawl provider');
        }

        const url = query.match(/https?:\/\/[^\s]+/i)?.[0];

        if (!url) {
          throw new Error('Firecrawl needs a URL in the request to extract web content');
        }

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, formats: ['markdown'] }),
        });

        if (!response.ok) {
          throw new Error(`Firecrawl request failed: ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as any;

        return payload.data?.markdown || payload.markdown || payload.data?.content || 'No extractable content found.';
      },
    });
  }
}
