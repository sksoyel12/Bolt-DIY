import MoonshotProvider from './moonshot';

export default class KimiProvider extends MoonshotProvider {
  name = 'Kimi';

  config = {
    apiTokenKey: 'KIMI_API_KEY',
  };

  staticModels = [
    {
      name: 'moonshot-v1-8k',
      label: 'Moonshot v1 8K',
      provider: 'Kimi',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
  ];
}
