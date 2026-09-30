import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { MODEL_SELECTOR_PROVIDERS, PROVIDER_LIST } from '~/utils/constants';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  modelLoading?: string;
}

export const ModelSelector = ({ model, setModel, provider, setProvider, providerList }: ModelSelectorProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedProviderIndex, setFocusedProviderIndex] = useState(-1);
  const providerOptionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setFocusedProviderIndex(-1);
  }, [isDropdownOpen]);

  const selectedProviderOption =
    MODEL_SELECTOR_PROVIDERS.find((item) => item.providerName === provider?.name) ?? MODEL_SELECTOR_PROVIDERS[0];

  const selectProvider = (providerOption: (typeof MODEL_SELECTOR_PROVIDERS)[number]) => {
    const selectedProvider = (providerList.find((item) => item.name === providerOption.providerName) ??
      PROVIDER_LIST.find((item) => item.name === providerOption.providerName)) as ProviderInfo | undefined;

    if (!selectedProvider) {
      return;
    }

    setProvider?.(selectedProvider);
    setModel?.(providerOption.model);
    setIsDropdownOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDropdownOpen) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedProviderIndex((previous) => (previous + 1 >= MODEL_SELECTOR_PROVIDERS.length ? 0 : previous + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedProviderIndex((previous) => (previous - 1 < 0 ? MODEL_SELECTOR_PROVIDERS.length - 1 : previous - 1));
        break;
      case 'Enter':
        event.preventDefault();

        if (focusedProviderIndex >= 0 && focusedProviderIndex < MODEL_SELECTOR_PROVIDERS.length) {
          selectProvider(MODEL_SELECTOR_PROVIDERS[focusedProviderIndex]);
        }

        break;
      case 'Escape':
        event.preventDefault();
        setIsDropdownOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (focusedProviderIndex >= 0) {
      providerOptionsRef.current[focusedProviderIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedProviderIndex]);

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
        <span className="min-w-0 truncate text-left">{selectedProviderOption.label}</span>
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
          aria-label="Choose a provider"
        >
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
            {MODEL_SELECTOR_PROVIDERS.map((providerOption, index) => {
              const isSelected = providerOption.providerName === provider?.name;

              return (
                <button
                  ref={(element) => {
                    providerOptionsRef.current[index] = element;
                  }}
                  key={providerOption.providerName}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={classNames(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left cursor-pointer',
                    'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none',
                    focusedProviderIndex === index ? 'ring-1 ring-inset ring-bolt-elements-focus' : undefined,
                  )}
                  onClick={() => selectProvider(providerOption)}
                  tabIndex={focusedProviderIndex === index ? 0 : -1}
                >
                  <span className="truncate">{providerOption.label}</span>
                  {isSelected && <span className="i-ph:check text-xs text-green-500" title="Selected" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
