import { describe, expect, it } from 'vitest';
import { STARTER_TEMPLATES } from './constants';
import { BUNDLED_STARTER_TEMPLATE_FILES } from './starter-template-files';
import { getTemplates } from './selectStarterTemplate';

describe('bundled starter templates', () => {
  const requiredTemplates = [
    {
      name: 'Expo App',
      dependencies: ['expo-router', '@expo/vector-icons', 'react-native-web'],
      requiredFile: 'app/(tabs)/_layout.tsx',
      marker: 'Tabs',
    },
    {
      name: 'Next.js App Router',
      dependencies: ['next', 'tailwindcss'],
      requiredFile: 'app/page.tsx',
      marker: 'App Router',
    },
    {
      name: 'Modern Landing Page',
      dependencies: ['vite', 'tailwindcss', 'framer-motion'],
      requiredFile: 'src/App.tsx',
      marker: 'motion',
    },
  ];

  it.each(requiredTemplates)('$name is selectable and has a runnable project structure', async (definition) => {
    expect(STARTER_TEMPLATES.some((template) => template.name === definition.name)).toBe(true);

    const files = BUNDLED_STARTER_TEMPLATE_FILES[definition.name];
    expect(files).toBeDefined();

    if (!files) {
      throw new Error(`Missing bundled files for ${definition.name}`);
    }

    expect(files.some((file) => file.path === definition.requiredFile)).toBe(true);

    const packageJsonFile = files.find((file) => file.path === 'package.json');
    expect(packageJsonFile).toBeDefined();

    const packageJson = JSON.parse(packageJsonFile!.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const dependency of definition.dependencies) {
      expect(allDependencies[dependency]).toBeTruthy();
    }

    expect(files.find((file) => file.path === definition.requiredFile)?.content).toContain(definition.marker);

    const generated = await getTemplates(definition.name, 'Template test');
    expect(generated?.assistantMessage).toContain(`filePath="package.json"`);
    expect(generated?.assistantMessage).toContain(`filePath="${definition.requiredFile}"`);
    expect(generated?.userMessage).toContain('install the dependencies');
  });
});
