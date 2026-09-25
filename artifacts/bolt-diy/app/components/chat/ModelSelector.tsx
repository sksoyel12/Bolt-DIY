import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';

const PROVIDER_LABELS: Record<string, string> = {
  Google: 'Google',
  Deepseek: 'DeepSeek',
  Moonshot: 'Moonshot',
  Zai: 'Z.AI',
  'Z.ai': 'Z.AI',
  Together: 'Together AI',
  Cerebras: 'Cerebras',
  Mistral: 'Mistral',
  Cohere: 'Cohere',
};

const getProviderLabel = (providerName: string) => PROVIDER_LABELS[providerName] || providerName;

const formatContextSize = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }

  return tokens.toString();
};

const isModelLikelyFree = (model: ModelInfo, providerName: string): boolean => {
  if (providerName === 'OpenRouter' && model.label.includes('in:$0.00') && model.label.includes('out:$0.00')) {
    return true;
  }

  return model.name.toLowerCase().includes('free') || model.label.toLowerCase().includes('free');
};

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  modelLoading?: string;
}

export const ModelSelector = ({
  model,
  setModel,
  provider,
  setProvider,
  modelList,
  providerList,
  modelLoading,
}: ModelSelectorProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);
  const [localProviderStatus, setLocalProviderStatus] = useState<Record<string, 'connected' | 'disconnected'>>({});
  const modelOptionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const statuses: Record<string, 'connected' | 'disconnected'> = {};

    for (const item of providerList) {
      if (LOCAL_PROVIDERS.includes(item.name)) {
        statuses[item.name] = modelList.some((entry) => entry.provider === item.name) ? 'connected' : 'disconnected';
      }
    }

    setLocalProviderStatus(statuses);
  }, [providerList, modelList]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const groupedModels = useMemo(
    () =>
      providerList
        .map((providerInfo) => ({
          provider: providerInfo,
          models: modelList
            .filter(
              (item) =>
                item.provider === providerInfo.name &&
                item.name &&
                (!showFreeModelsOnly || isModelLikelyFree(item, providerInfo.name)),
            )
            .sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .filter(({ models: items }) => items.length > 0),
    [modelList, providerList, showFreeModelsOnly],
  );

  const filteredModels = useMemo(
    () => groupedModels.flatMap(({ models: items }) => items),
    [groupedModels],
  );

  const selectedModel = modelList.find((item) => item.name === model && item.provider === provider?.name);

  useEffect(() => {
    setFocusedModelIndex(-1);
  }, [isDropdownOpen, showFreeModelsOnly]);

  useEffect(() => {
    if (providerList.length === 0 || modelList.length === 0) {
      return;
    }

    if (selectedModel) {
      return;
    }

    const fallbackModel =
      modelList.find((item) => item.name === model) ??
      modelList.find((item) => item.provider === provider?.name) ??
      modelList.find((item) => providerList.some((entry) => entry.name === item.provider));
    const fallbackProvider = fallbackModel && providerList.find((item) => item.name === fallbackModel.provider);

    if (fallbackProvider && fallbackProvider.name !== provider?.name) {
      setProvider?.(fallbackProvider);
    }

    if (fallbackModel && fallbackModel.name !== model) {
      setModel?.(fallbackModel.name);
    }
  }, [model, modelList, provider?.name, providerList, selectedModel, setModel, setProvider]);

  const selectModel = (selected: ModelInfo) => {
    const selectedProvider = providerList.find((item) => item.name === selected.provider);

    if (selectedProvider) {
      setProvider?.(selectedProvider);
    }

    setModel?.(selected.name);
    setIsDropdownOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDropdownOpen) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedModelIndex((previous) => (previous + 1 >= filteredModels.length ? 0 : previous + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedModelIndex((previous) => (previous - 1 < 0 ? filteredModels.length - 1 : previous - 1));
        break;
      case 'Enter':
        event.preventDefault();

        if (focusedModelIndex >= 0 && focusedModelIndex < filteredModels.length) {
          selectModel(filteredModels[focusedModelIndex]);
        }

        break;
      case 'Escape':
        event.preventDefault();
        setIsDropdownOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (focusedModelIndex >= 0) {
      modelOptionsRef.current[focusedModelIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedModelIndex]);

  if (providerList.length === 0) {
    return (
      <div className="mb-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary">
        <p className="text-center">
          No providers are currently enabled. Please enable at least one provider in the settings to start using the
          chat.
        </p>
      </div>
    );
  }

  if (modelList.length === 0) {
    return (
      <div className="mb-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary">
        <p className="text-center">No models are currently available. Add a model provider to start using chat.</p>
      </div>
    );
  }

  let modelIndex = 0;

  return (
    <div className="relative w-full" onKeyDown={handleKeyDown} ref={dropdownRef}>
      <button
        type="button"
        className={classNames(
          'flex w-full items-center justify-between gap-3 p-2 rounded-lg border border-bolt-elements-borderColor',
          'bg-bolt-elements-prompt-background text-bolt-elements-textPrimary',
          'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
          'transition-all cursor-pointer',
          isDropdownOpen ? 'ring-2 ring-bolt-elements-focus' : undefined,
        )}
        onClick={() => setIsDropdownOpen((open) => !open)}
        role="combobox"
        aria-expanded={isDropdownOpen}
        aria-controls="model-listbox"
        aria-haspopup="listbox"
      >
        <span className="min-w-0 truncate text-left">
          {selectedModel?.label || 'Select a model'}
          {selectedModel && (
            <span className="ml-2 text-xs text-bolt-elements-textTertiary">
              {getProviderLabel(selectedModel.provider)}
            </span>
          )}
        </span>
        <span
          className={classNames(
            'i-ph:caret-down w-4 h-4 flex-shrink-0 text-bolt-elements-textSecondary opacity-75',
            isDropdownOpen ? 'rotate-180' : undefined,
          )}
          aria-hidden="true"
        />
      </button>

      {isDropdownOpen && (
        <div
          className="absolute z-20 w-full mt-1 py-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-lg"
          role="listbox"
          id="model-listbox"
          aria-label="Choose a model"
        >
          {providerList.some((item) => item.name === 'OpenRouter') && (
            <div className="px-2 pb-2">
              <button
                type="button"
                onClick={() => setShowFreeModelsOnly((show) => !show)}
                className={classNames(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
                  'hover:bg-bolt-elements-background-depth-3',
                  showFreeModelsOnly
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary border border-bolt-elements-borderColor',
                )}
              >
                <span className="i-ph:gift text-xs" aria-hidden="true" />
                Free models only
              </button>
            </div>
          )}

          {modelLoading === 'all' ? (
            <div className="px-3 py-3 text-sm text-bolt-elements-textTertiary">
              <span className="i-ph:spinner mr-2 animate-spin" aria-hidden="true" />
              Loading models...
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="px-3 py-3 text-sm text-bolt-elements-textTertiary">
              {showFreeModelsOnly ? 'No free models available' : 'No models available'}
            </div>
          ) : (
            <div
              className={classNames(
                'max-h-60 overflow-y-auto',
                'sm:scrollbar-none',
                '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2',
                '[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor',
                '[&::-webkit-scrollbar-thumb]:hover:bg-bolt-elements-borderColorHover',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
                '[&::-webkit-scrollbar-track]:bg-bolt-elements-background-depth-2',
                '[&::-webkit-scrollbar-track]:rounded-full',
                'sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar]:h-1.5',
                'sm:hover:[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor/50',
                'sm:hover:[&::-webkit-scrollbar-thumb:hover]:bg-bolt-elements-borderColor',
                'sm:[&::-webkit-scrollbar-track]:bg-transparent',
              )}
            >
              {groupedModels.map(({ provider: groupProvider, models: items }) => (
                <div key={groupProvider.name} role="group" aria-label={getProviderLabel(groupProvider.name)}>
                  <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2">
                    {LOCAL_PROVIDERS.includes(groupProvider.name) && (
                      <span
                        className={classNames(
                          'inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
                          localProviderStatus[groupProvider.name] === 'connected'
                            ? 'bg-green-500'
                            : localProviderStatus[groupProvider.name] === 'disconnected'
                              ? 'bg-red-400'
                              : 'bg-bolt-elements-textTertiary',
                        )}
                        aria-hidden="true"
                      />
                    )}
                    {getProviderLabel(groupProvider.name)}
                    {modelLoading === groupProvider.name && (
                      <span className="i-ph:spinner ml-auto animate-spin" aria-label="Loading models" />
                    )}
                  </div>
                  {items.map((modelOption) => {
                    const index = modelIndex++;
                    const isSelected = model === modelOption.name && provider?.name === modelOption.provider;

                    return (
                      <button
                        ref={(element) => {
                          modelOptionsRef.current[index] = element;
                        }}
                        key={`${modelOption.provider}:${modelOption.name}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={classNames(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left cursor-pointer',
                          'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none',
                          isSelected || focusedModelIndex === index ? 'bg-bolt-elements-background-depth-2' : undefined,
                          focusedModelIndex === index ? 'ring-1 ring-inset ring-bolt-elements-focus' : undefined,
                        )}
                        onClick={() => selectModel(modelOption)}
                        tabIndex={focusedModelIndex === index ? 0 : -1}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate" dangerouslySetInnerHTML={{ __html: modelOption.label }} />
                          <span className="mt-0.5 block text-xs text-bolt-elements-textTertiary">
                            {formatContextSize(modelOption.maxTokenAllowed)} tokens
                          </span>
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-1">
                          {isModelLikelyFree(modelOption, modelOption.provider) && (
                            <span className="i-ph:gift text-xs text-purple-400" title="Free model" />
                          )}
                          {isSelected && <span className="i-ph:check text-xs text-green-500" title="Selected" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};