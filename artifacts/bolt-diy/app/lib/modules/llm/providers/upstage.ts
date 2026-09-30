import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';

export default class UpstageProvider extends BaseProvider {
  name = 'Upstage';
  getApiKeyLink = 'https://console.upstage.ai/api-keys';

  config = {
    apiTokenKey: 'UPSTAGE_API_KEY',
    baseUrl: 'https://api.upstage.ai/v1/solar',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'solar-pro2',
      label: 'Solar Pro 2',
      provider: 'Upstage',
      maxTokenAllowed: 32768,
    },
    {
      name: 'solar-pro',
      label: 'Solar Pro',
      provider: 'Upstage',
      maxTokenAllowed: 32768,
    },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;
    const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'UPSTAGE_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    return getOpenAILikeModel(baseUrl || this.config.baseUrl, apiKey, model);
  }
}