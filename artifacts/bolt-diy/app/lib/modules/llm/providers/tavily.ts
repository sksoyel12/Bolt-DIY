import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createAgentLanguageModel } from '~/lib/modules/llm/agent-model';

export default class TavilyProvider extends BaseProvider {
  name = 'Tavily';

  config = {
    apiTokenKey: 'TAVILY_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'tavily-search',
      label: 'Tavily Search Agent',
      provider: 'Tavily',
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
      defaultApiTokenKey: 'TAVILY_API_KEY',
    });

    return createAgentLanguageModel({
      provider: this.name,
      model: options.model,
      run: async (query) => {
        if (!apiKey) {
          throw new Error('Missing API key for Tavily provider');
        }

        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'advanced',
            include_answer: 'advanced',
            max_results: 5,
          }),
        });

        if (!response.ok) {
          throw new Error(`Tavily request failed: ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as any;
        const sources = (payload.results || [])
          .map((result: any) => `- ${result.title || result.url}: ${result.url}`)
          .join('\n');

        return (
          [payload.answer, sources && `Sources:\n${sources}`].filter(Boolean).join('\n\n') || 'No search results found.'
        );
      },
    });
  }
}
