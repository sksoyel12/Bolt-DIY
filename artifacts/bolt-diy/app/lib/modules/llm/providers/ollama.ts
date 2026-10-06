import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { logger } from '~/utils/logger';

interface OllamaModelDetails {
  parent_model: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaApiResponse {
  models: OllamaModel[];
}

export default class OllamaProvider extends BaseProvider {
  name = 'Ollama';
  getApiKeyLink = 'https://ollama.com/download';
  labelForGetApiKey = 'Download Ollama';
  icon = 'i-ph:cloud-arrow-down';

  config = {
    baseUrlKey: 'OLLAMA_API_BASE_URL',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'llama3.2',
      label: 'Llama 3.2',
      provider: 'Ollama',
      maxTokenAllowed: 32768,
      maxCompletionTokens: 4096,
    },
  ];

  getDefaultNumCtx(serverEnv?: Env): number {
    const envRecord = this.convertEnvToRecord(serverEnv);

    return envRecord.DEFAULT_NUM_CTX ? parseInt(envRecord.DEFAULT_NUM_CTX, 10) : 32768;
  }

  private _resolveBaseUrl(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): string {
    let { baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'OLLAMA_API_BASE_URL',
      defaultApiTokenKey: '',
    });

    if (!baseUrl) {
      throw new Error(
        'Ollama URL is not configured. Open Settings > Local Providers and set a server URL reachable by this app. For an app running on the same computer as Ollama, use http://localhost:11434.',
      );
    }

    baseUrl = this.resolveDockerUrl(baseUrl, serverEnv);

    return baseUrl;
  }

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const baseUrl = this._resolveBaseUrl(apiKeys, settings, serverEnv);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaApiResponse;

      return data.models.map((model: OllamaModel) => ({
        name: model.name,
        label: `${model.name} (${model.details.parameter_size})`,
        provider: this.name,
        maxTokenAllowed: 8000,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        logger.warn('Ollama model fetch timed out — is Ollama running?');

        return [];
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        logger.warn(`Ollama not reachable at ${baseUrl} — is Ollama running?`);

        return [];
      }

      logger.error('Error fetching Ollama models:', error);

      return [];
    }
  }

  getModelInstance: (options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;
    const envRecord = this.convertEnvToRecord(serverEnv);

    const baseUrl = this._resolveBaseUrl(apiKeys, providerSettings?.[this.name], envRecord);

    logger.debug('Ollama Base Url used: ', baseUrl);

    const ollamaProvider = createOllama({
      baseURL: `${baseUrl}/api`,
    });

    return ollamaProvider(model, {
      numCtx: this.getDefaultNumCtx(serverEnv),
    });
  };
}
