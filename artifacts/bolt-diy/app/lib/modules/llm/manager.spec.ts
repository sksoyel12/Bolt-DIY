import { describe, expect, it } from 'vitest';
import { isRetryableProviderError, LLMManager } from './manager';

describe('LLM provider fallback', () => {
  it.each([
    [{ status: 429 }, true],
    [{ statusCode: 503 }, true],
    [new Error('quota exceeded for this model'), true],
    [new Error('fetch failed: ECONNRESET'), true],
    [{ status: 401, message: 'invalid API key' }, false],
    [{ status: 400, message: 'invalid request' }, false],
  ])('classifies provider failure %#', (error, retryable) => {
    expect(isRetryableProviderError(error)).toBe(retryable);
  });

  it('selects a configured backup provider and one of its known models', () => {
    const manager = LLMManager.getInstance({ OPENAI_API_KEY: 'test-openai-key' });
    const fallback = manager.getConfiguredFallback({
      primaryProvider: 'Groq',
      serverEnv: { OPENAI_API_KEY: 'test-openai-key' },
    });

    expect(fallback?.provider.name).toBe('OpenAI');
    expect(fallback?.model.name).toBeTruthy();
  });

  it('honors an explicitly configured fallback provider and model', () => {
    const manager = LLMManager.getInstance({
      BOLT_FALLBACK_PROVIDER: 'OpenAI',
      BOLT_FALLBACK_MODEL: 'gpt-4o-mini',
      OPENAI_API_KEY: 'test-openai-key',
    });
    const fallback = manager.getConfiguredFallback({
      primaryProvider: 'Groq',
      serverEnv: {
        BOLT_FALLBACK_PROVIDER: 'OpenAI',
        BOLT_FALLBACK_MODEL: 'gpt-4o-mini',
        OPENAI_API_KEY: 'test-openai-key',
      },
    });

    expect(fallback?.provider.name).toBe('OpenAI');
    expect(fallback?.model.name).toBe('gpt-4o-mini');
  });
});
