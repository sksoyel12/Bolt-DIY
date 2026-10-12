import type { LanguageModelV1 } from 'ai';

function promptToText(prompt: any): string {
  if (!Array.isArray(prompt)) {
    return String(prompt || '');
  }

  return (
    prompt
      .map((message) => {
        if (typeof message?.content === 'string') {
          return message.content;
        }

        if (Array.isArray(message?.content)) {
          return message.content
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .filter(Boolean)
            .join('\n');
        }

        return '';
      })
      .filter(Boolean)
      .pop() || ''
  );
}

export function createAgentLanguageModel(options: {
  provider: string;
  model: string;
  run: (query: string) => Promise<string>;
}): LanguageModelV1 {
  const createResult = async (callOptions: any) => {
    const text = await options.run(promptToText(callOptions.prompt));

    return {
      text,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: text.split(/\s+/).filter(Boolean).length,
      },
      rawCall: {
        rawPrompt: callOptions.prompt,
        rawSettings: callOptions,
      },
      warnings: [],
    };
  };

  return {
    specificationVersion: 'v1',
    provider: options.provider,
    modelId: options.model,
    defaultObjectGenerationMode: undefined,
    doGenerate: createResult,
    doStream: async (callOptions: any) => {
      const result = await createResult(callOptions);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', textDelta: result.text });
          controller.enqueue({
            type: 'finish',
            finishReason: result.finishReason,
            usage: result.usage,
          });
          controller.close();
        },
      });

      return {
        stream,
        rawCall: result.rawCall,
        warnings: result.warnings,
      };
    },
  } as unknown as LanguageModelV1;
}
