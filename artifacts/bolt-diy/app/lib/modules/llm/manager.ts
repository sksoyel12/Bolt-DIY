import type { IProviderSetting } from '~/types/model';
import { BaseProvider } from './base-provider';
import type { ModelInfo, ProviderInfo } from './types';
import * as providers from './registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LLMManager');
const MODEL_CATALOG_ENABLED = true;
const ENABLED_PROVIDER_NAMES = new Set([
  'Groq',
  'Google',
  'OpenAI',
  'Anthropic',
  'HuggingFace',
  'Ollama',
  'Moonshot',
  'OpenRouter',
  'Deepseek',
  'Z.ai',
  'Together',
  'Cerebras',
  'Mistral',
  'Cohere',
  'Upstage',
  'Kimi',
  'Firecrawl',
  'Tavily',
]);

const FALLBACK_PROVIDER_ORDER = [
  'Groq',
  'Google',
  'OpenAI',
  'Anthropic',
  'HuggingFace',
  'Deepseek',
  'OpenRouter',
  'Cerebras',
  'Mistral',
  'Together',
];

export interface ModelFallbackTarget {
  provider: BaseProvider;
  model: ModelInfo;
}

export class LLMManager {
  private static _instance: LLMManager;
  private _providers: Map<string, BaseProvider> = new Map();
  private _modelList: ModelInfo[] = [];
  private _env: Record<string, string> = {};

  private constructor(_env: Record<string, string>) {
    this._registerProvidersFromDirectory();
    this._env = _env;
  }

  static getInstance(env: Record<string, string> = {}): LLMManager {
    if (!LLMManager._instance) {
      LLMManager._instance = new LLMManager(env);
    } else if (Object.keys(env).length > 0) {
      // Update env on subsequent calls so Cloudflare Workers get fresh bindings
      LLMManager._instance._env = env;
    }

    return LLMManager._instance;
  }
  get env() {
    return this._env;
  }

  private _registerProvidersFromDirectory() {
    try {
      /*
       * Dynamically import all files from the providers directory
       * const providerModules = import.meta.glob('./providers/*.ts', { eager: true });
       */

      // Look for exported classes that extend BaseProvider
      for (const exportedItem of Object.values(providers)) {
        if (typeof exportedItem === 'function' && exportedItem.prototype instanceof BaseProvider) {
          const provider = new exportedItem();

          try {
            if (ENABLED_PROVIDER_NAMES.has(provider.name)) {
              this.registerProvider(provider);
            }
          } catch (error: any) {
            logger.warn('Failed To Register Provider: ', provider.name, 'error:', error.message);
          }
        }
      }
    } catch (error) {
      logger.error('Error registering providers:', error);
    }
  }

  registerProvider(provider: BaseProvider) {
    if (this._providers.has(provider.name)) {
      logger.warn(`Provider ${provider.name} is already registered. Skipping.`);
      return;
    }

    logger.info('Registering Provider: ', provider.name);
    this._providers.set(provider.name, provider);
    this._modelList = [...this._modelList, ...provider.staticModels];
  }

  getProvider(name: string): BaseProvider | undefined {
    return this._providers.get(name);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this._providers.values());
  }

  getModelList(): ModelInfo[] {
    return MODEL_CATALOG_ENABLED ? this._modelList : [];
  }

  async updateModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): Promise<ModelInfo[]> {
    if (!MODEL_CATALOG_ENABLED) {
      this._modelList = [];

      return [];
    }

    const { apiKeys, providerSettings, serverEnv } = options;

    let enabledProviders = Array.from(this._providers.values()).map((p) => p.name);

    if (providerSettings && Object.keys(providerSettings).length > 0) {
      enabledProviders = enabledProviders.filter((providerName) => providerSettings[providerName]?.enabled === true);
    }

    // Get dynamic models from all providers that support them
    const dynamicModels = await Promise.all(
      Array.from(this._providers.values())
        .filter((provider) => enabledProviders.includes(provider.name))
        .filter(
          (provider): provider is BaseProvider & Required<Pick<ProviderInfo, 'getDynamicModels'>> =>
            !!provider.getDynamicModels,
        )
        .map(async (provider) => {
          const cachedModels = provider.getModelsFromCache(options);

          if (cachedModels) {
            return cachedModels;
          }

          const dynamicModels = await provider
            .getDynamicModels(apiKeys, providerSettings?.[provider.name], serverEnv)
            .then((models) => {
              logger.info(`Caching ${models.length} dynamic models for ${provider.name}`);
              provider.storeDynamicModels(options, models);

              return models;
            })
            .catch((err) => {
              logger.error(`Error getting dynamic models ${provider.name} :`, err);
              return [];
            });

          return dynamicModels;
        }),
    );
    const staticModels = Array.from(this._providers.values()).flatMap((p) => p.staticModels || []);
    const dynamicModelsFlat = dynamicModels.flat();
    const dynamicModelKeys = dynamicModelsFlat.map((d) => `${d.name}-${d.provider}`);
    const filteredStaticModels = staticModels.filter((m) => !dynamicModelKeys.includes(`${m.name}-${m.provider}`));

    // Combine static and dynamic models
    const modelList = [...dynamicModelsFlat, ...filteredStaticModels];
    modelList.sort((a, b) => a.name.localeCompare(b.name));
    this._modelList = modelList;

    return modelList;
  }
  getStaticModelList() {
    return MODEL_CATALOG_ENABLED ? [...this._providers.values()].flatMap((p) => p.staticModels || []) : [];
  }
  async getModelListFromProvider(
    providerArg: BaseProvider,
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
  ): Promise<ModelInfo[]> {
    const provider = this._providers.get(providerArg.name);

    if (!provider) {
      throw new Error(`Provider ${providerArg.name} not found`);
    }

    if (!MODEL_CATALOG_ENABLED) {
      return [];
    }

    const staticModels = provider.staticModels || [];

    if (!provider.getDynamicModels) {
      return staticModels;
    }

    const { apiKeys, providerSettings, serverEnv } = options;

    const cachedModels = provider.getModelsFromCache({
      apiKeys,
      providerSettings,
      serverEnv,
    });

    if (cachedModels) {
      logger.info(`Found ${cachedModels.length} cached models for ${provider.name}`);
      return [...cachedModels, ...staticModels];
    }

    logger.info(`Getting dynamic models for ${provider.name}`);

    const dynamicModels = await provider
      .getDynamicModels?.(apiKeys, providerSettings?.[provider.name], serverEnv)
      .then((models) => {
        logger.info(`Got ${models.length} dynamic models for ${provider.name}`);
        provider.storeDynamicModels(options, models);

        return models;
      })
      .catch((err) => {
        logger.error(`Error getting dynamic models ${provider.name} :`, err);
        return [];
      });
    const dynamicModelsName = dynamicModels.map((d) => d.name);
    const filteredStaticList = staticModels.filter((m) => !dynamicModelsName.includes(m.name));
    const modelList = [...dynamicModels, ...filteredStaticList];
    modelList.sort((a, b) => a.name.localeCompare(b.name));

    return modelList;
  }
  getStaticModelListFromProvider(providerArg: BaseProvider) {
    const provider = this._providers.get(providerArg.name);

    if (!provider) {
      throw new Error(`Provider ${providerArg.name} not found`);
    }

    return MODEL_CATALOG_ENABLED ? [...(provider.staticModels || [])] : [];
  }
  async getModelDetailsFromProvider(
    providerArg: BaseProvider,
    modelName: string,
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
  ): Promise<ModelInfo> {
    const provider = this._providers.get(providerArg.name);

    if (!provider) {
      throw new Error(`Provider ${providerArg.name} not found`);
    }

    const staticModel = (provider.staticModels || []).find((model) => model.name === modelName);

    if (staticModel) {
      return staticModel;
    }

    const availableModels = await this.getModelListFromProvider(provider, options);
    const requestedModel = availableModels.find((model) => model.name === modelName);

    if (requestedModel) {
      return requestedModel;
    }

    if (availableModels.length > 0) {
      logger.warn(
        `Model [${modelName}] is not listed by provider [${provider.name}]. Falling back to [${availableModels[0].name}].`,
      );
      return availableModels[0];
    }

    if (!modelName.trim()) {
      throw new Error(`No model was selected for provider ${provider.name}`);
    }

    logger.warn(
      `Provider [${provider.name}] returned no model catalog. Attempting the explicitly selected model [${modelName}].`,
    );

    return {
      name: modelName,
      label: modelName,
      provider: provider.name,
      maxTokenAllowed: 128_000,
      maxCompletionTokens: 4_096,
    };
  }

  getConfiguredFallback(options: {
    primaryProvider: string;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): ModelFallbackTarget | null {
    const { primaryProvider, apiKeys, providerSettings, serverEnv } = options;
    const runtimeEnv = { ...this._env, ...serverEnv };
    const requestedProvider = runtimeEnv.BOLT_FALLBACK_PROVIDER || runtimeEnv.LLM_FALLBACK_PROVIDER;
    const requestedModel = runtimeEnv.BOLT_FALLBACK_MODEL || runtimeEnv.LLM_FALLBACK_MODEL;
    const orderedNames = requestedProvider
      ? [requestedProvider]
      : FALLBACK_PROVIDER_ORDER.filter((name) => name !== primaryProvider);

    for (const name of orderedNames) {
      const provider = this._providers.get(name);

      if (!provider || provider.name === primaryProvider || providerSettings?.[provider.name]?.enabled === false) {
        continue;
      }

      const tokenKeys = [...(provider.config.apiTokenKeys || []), provider.config.apiTokenKey].filter(
        (key): key is string => Boolean(key),
      );
      const hasApiKey = Boolean(apiKeys?.[provider.name] || tokenKeys.some((key) => runtimeEnv[key] || this._env[key]));
      const baseUrlKey = provider.config.baseUrlKey;
      const canConnectWithoutKey =
        provider.name === 'Ollama' &&
        Boolean(providerSettings?.[provider.name]?.baseUrl || (baseUrlKey && runtimeEnv[baseUrlKey]));

      if (!hasApiKey && !canConnectWithoutKey) {
        continue;
      }

      const model =
        provider.staticModels.find((candidate) => candidate.name === requestedModel) ||
        (requestedModel
          ? {
              name: requestedModel,
              label: requestedModel,
              provider: provider.name,
              maxTokenAllowed: 128_000,
              maxCompletionTokens: 4_096,
            }
          : provider.staticModels[0]);

      if (model) {
        return { provider, model };
      }
    }

    return null;
  }

  getDefaultProvider(): BaseProvider {
    const firstProvider = this._providers.values().next().value;

    if (!firstProvider) {
      throw new Error('No providers registered');
    }

    return firstProvider;
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  const current = error as {
    status?: number | string;
    statusCode?: number | string;
    response?: { status?: number | string };
    message?: string;
    code?: string;
    cause?: unknown;
  };
  const status = Number(current?.statusCode ?? current?.status ?? current?.response?.status);

  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }

  const message = [current?.message, current?.code, (current?.cause as Error)?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(rate.?limit|too many requests|quota|resource_exhausted|overloaded|network|fetch failed|econnreset|econnrefused|etimedout|socket hang up|timed out|gateway timeout)/i.test(
    message,
  );
}
