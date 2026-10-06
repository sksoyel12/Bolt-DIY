export interface StarterTemplateFile {
  name: string;
  path: string;
  content: string;
}

const file = (path: string, content: string): StarterTemplateFile => ({
  name: path.split('/').pop() || path,
  path,
  content,
});

export const BUNDLED_STARTER_TEMPLATE_FILES: Record<string, StarterTemplateFile[]> = {
  'Expo App': [
    file(
      'package.json',
      JSON.stringify(
        {
          name: 'expo-tabs-starter',
          version: '1.0.0',
          private: true,
          main: 'expo-router/entry',
          scripts: {
            start: 'expo start',
            web: 'expo start --web',
            android: 'expo start --android',
            ios: 'expo start --ios',
            typecheck: 'tsc --noEmit',
          },
          dependencies: {
            '@expo/vector-icons': '^14.0.2',
            expo: '~52.0.0',
            'expo-constants': '~17.0.8',
            'expo-linking': '~7.0.5',
            'expo-router': '~4.0.21',
            'expo-status-bar': '~2.0.1',
            react: '18.3.1',
            'react-dom': '18.3.1',
            'react-native': '0.76.5',
            'react-native-gesture-handler': '~2.20.2',
            'react-native-reanimated': '~3.16.1',
            'react-native-safe-area-context': '4.12.0',
            'react-native-screens': '~4.4.0',
            'react-native-web': '~0.19.13',
          },
          devDependencies: {
            '@types/react': '~18.3.12',
            typescript: '~5.3.3',
          },
        },
        null,
        2,
      ),
    ),
    file(
      'app.json',
      JSON.stringify(
        {
          expo: {
            name: 'Expo Tabs Starter',
            slug: 'expo-tabs-starter',
            scheme: 'expotabsstarter',
            userInterfaceStyle: 'automatic',
            newArchEnabled: false,
            plugins: ['expo-router'],
            experiments: { typedRoutes: true },
            web: { bundler: 'metro' },
          },
        },
        null,
        2,
      ),
    ),
    file(
      'tsconfig.json',
      JSON.stringify({ extends: 'expo/tsconfig.base', compilerOptions: { strict: true } }, null, 2),
    ),
    file('expo-env.d.ts', '/// <reference types="expo/types" />\n'),
    file(
      'app/_layout.tsx',
      `import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
`,
    ),
    file(
      'app/(tabs)/_layout.tsx',
      `import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6d5dfc',
        tabBarInactiveTintColor: '#8990a4',
        tabBarStyle: { height: 66, paddingTop: 8, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
`,
    ),
    file(
      'app/(tabs)/index.tsx',
      `import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const projects = [
  { title: 'Design system', detail: '12 components · Updated today', icon: 'palette-outline' as const },
  { title: 'Mobile banking', detail: '8 screens · Updated yesterday', icon: 'cellphone' as const },
];

export default function HomeScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f6f7fb' }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={{ color: '#6d5dfc', fontSize: 14, fontWeight: '700' }}>YOUR WORKSPACE</Text>
      <Text style={{ color: '#16192b', fontSize: 34, fontWeight: '800', marginTop: 8 }}>Build something great.</Text>
      <Text style={{ color: '#70778d', fontSize: 16, marginTop: 10 }}>A shared starting point for web and mobile.</Text>
      <View style={{ backgroundColor: '#6d5dfc', borderRadius: 22, padding: 22, marginTop: 28 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>QUICK START</Text>
        <Text style={{ color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 8 }}>Your next idea starts here</Text>
        <Text style={{ color: '#e7e4ff', fontSize: 15, marginTop: 8 }}>Edit these screens and make them yours.</Text>
      </View>
      <Text style={{ color: '#16192b', fontSize: 20, fontWeight: '800', marginTop: 32, marginBottom: 12 }}>
        Recent projects
      </Text>
      {projects.map((project) => (
        <View key={project.title} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name={project.icon} size={26} color="#6d5dfc" />
          <View style={{ marginLeft: 14 }}>
            <Text style={{ color: '#16192b', fontSize: 16, fontWeight: '700' }}>{project.title}</Text>
            <Text style={{ color: '#858ba0', fontSize: 13, marginTop: 4 }}>{project.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
`,
    ),
    file(
      'app/(tabs)/explore.tsx',
      `import { Text, View } from 'react-native';

export default function ExploreScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f6f7fb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#16192b', fontSize: 28, fontWeight: '800' }}>Explore</Text>
      <Text style={{ color: '#70778d', fontSize: 16, marginTop: 8, textAlign: 'center' }}>
        Add discovery, search, or community features here.
      </Text>
    </View>
  );
}
`,
    ),
    file(
      'app/(tabs)/profile.tsx',
      `import { Text, View } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f6f7fb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#16192b', fontSize: 28, fontWeight: '800' }}>Your profile</Text>
      <Text style={{ color: '#70778d', fontSize: 16, marginTop: 8, textAlign: 'center' }}>
        Add account details and preferences here.
      </Text>
    </View>
  );
}
`,
    ),
  ],
  'Next.js App Router': [
    file(
      'package.json',
      JSON.stringify(
        {
          name: 'next-app-router-starter',
          version: '1.0.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            typecheck: 'tsc --noEmit',
          },
          dependencies: {
            next: '15.3.3',
            react: '19.0.0',
            'react-dom': '19.0.0',
          },
          devDependencies: {
            '@tailwindcss/postcss': '^4.1.4',
            '@types/node': '^22.14.0',
            '@types/react': '^19.0.12',
            '@types/react-dom': '^19.0.4',
            tailwindcss: '^4.1.4',
            typescript: '^5.8.3',
          },
        },
        null,
        2,
      ),
    ),
    file(
      'next.config.ts',
      `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {};\nexport default nextConfig;\n`,
    ),
    file(
      'postcss.config.mjs',
      `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
`,
    ),
    file(
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2,
      ),
    ),
    file('next-env.d.ts', `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`),
    file(
      'app/layout.tsx',
      `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Next App Starter',
  description: 'A clean Next.js App Router and Tailwind CSS starter.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    ),
    file(
      'app/globals.css',
      `@import "tailwindcss";\n\n:root { color-scheme: light; }\nbody { margin: 0; font-family: Arial, Helvetica, sans-serif; }\n`,
    ),
    file(
      'app/page.tsx',
      `export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 text-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between py-7">
        <span className="text-lg font-bold tracking-tight">Northstar</span>
        <a className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10" href="#get-started">
          Get started
        </a>
      </nav>
      <section className="mx-auto flex min-h-[75vh] max-w-6xl flex-col justify-center py-20">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.25em] text-violet-300">Next.js App Router</p>
        <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
          Start with a clear path forward.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
          A practical App Router foundation with TypeScript and Tailwind CSS. Replace this page with your product.
        </p>
        <a id="get-started" className="mt-9 w-fit rounded-full bg-violet-400 px-6 py-3 font-semibold text-slate-950 hover:bg-violet-300" href="#">
          Explore the starter
        </a>
      </section>
    </main>
  );
}
`,
    ),
  ],
  'Modern Landing Page': [
    file(
      'package.json',
      JSON.stringify(
        {
          name: 'modern-landing-page',
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc -b && vite build',
            preview: 'vite preview',
            typecheck: 'tsc --noEmit',
          },
          dependencies: {
            'framer-motion': '^12.7.4',
            'lucide-react': '^0.468.0',
            react: '^19.1.0',
            'react-dom': '^19.1.0',
          },
          devDependencies: {
            '@tailwindcss/vite': '^4.1.4',
            '@types/react': '^19.0.12',
            '@types/react-dom': '^19.0.4',
            '@vitejs/plugin-react': '^4.4.1',
            tailwindcss: '^4.1.4',
            typescript: '^5.8.3',
            vite: '^6.3.5',
          },
        },
        null,
        2,
      ),
    ),
    file(
      'index.html',
      `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#0b1020" /><title>Northstar — Build with clarity</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
    ),
    file(
      'vite.config.ts',
      `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`,
    ),
    file(
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            useDefineForClassFields: true,
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'Bundler',
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    ),
    file(
      'src/main.tsx',
      `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    ),
    file(
      'src/index.css',
      `@import "tailwindcss";

:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #f5f6fb; background: #0b1020; font-synthesis: none; text-rendering: optimizeLegibility; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
`,
    ),
    file(
      'src/App.tsx',
      `import { motion } from 'framer-motion';
import { ArrowRight, Menu, Sparkles } from 'lucide-react';

const features = [
  { title: 'A focused workflow', detail: 'Keep the important work visible and the noise out of your way.' },
  { title: 'Built to move faster', detail: 'Turn your next idea into a polished first release with less overhead.' },
  { title: 'Room to grow', detail: 'Start simple today, then extend the experience as your product evolves.' },
];

export default function App() {
  return (
    <main className="overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="#" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-400 text-slate-950"><Sparkles size={18} /></span>
          northstar
        </a>
        <div className="hidden items-center gap-8 text-sm text-slate-300 sm:flex">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#story" className="hover:text-white">Our story</a>
          <a href="#contact" className="hover:text-white">Contact</a>
        </div>
        <a href="#contact" className="hidden rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-violet-200 sm:block">
          Get started
        </a>
        <button aria-label="Open navigation" className="rounded-full border border-white/15 p-2 sm:hidden"><Menu size={20} /></button>
      </nav>

      <section className="relative mx-auto grid min-h-[78vh] max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div className="pointer-events-none absolute -left-48 top-0 size-[34rem] rounded-full bg-violet-500/15 blur-[110px]" />
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-4 py-2 text-sm text-violet-200">
            <Sparkles size={15} /> A calmer way to build
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-7xl">
            Make good ideas <span className="text-violet-300">happen.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
            Bring your team, your plans, and your next big idea into one focused place. Start small. Build with confidence.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#contact" className="inline-flex items-center gap-2 rounded-full bg-violet-300 px-6 py-3.5 font-semibold text-slate-950 transition hover:bg-violet-200">
              Start building <ArrowRight size={18} />
            </a>
            <a href="#features" className="rounded-full border border-white/15 px-6 py-3.5 font-medium text-white/85 transition hover:bg-white/5">
              See what you can do
            </a>
          </div>
          <p className="mt-5 text-sm text-slate-500">No card required · Ready when you are</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="relative mx-auto w-full max-w-md"
        >
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-violet-400/25 via-sky-300/10 to-transparent blur-2xl" />
          <div className="relative rounded-[1.75rem] border border-white/10 bg-slate-900/90 p-5 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div><p className="text-xs text-slate-400">YOUR NEXT PROJECT</p><p className="mt-1 font-semibold">Product launch</p></div>
              <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">On track</span>
            </div>
            <div className="mt-5 rounded-2xl bg-gradient-to-br from-violet-400/20 to-sky-300/10 p-5">
              <p className="text-sm text-slate-300">A little progress adds up</p>
              <div className="mt-5 flex items-end justify-between">
                <div><p className="text-4xl font-semibold">68%</p><p className="mt-1 text-xs text-slate-400">Launch readiness</p></div>
                <div className="flex h-20 items-end gap-2">{[35, 54, 42, 72, 61, 88, 68].map((height, index) => <span key={index} style={{ height: height + '%' }} className="w-3 rounded-t-md bg-violet-300/80" />)}</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {['Set the direction', 'Share the first draft', 'Get feedback'].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <span className={'grid size-6 place-items-center rounded-full text-xs ' + (index === 0 ? 'bg-violet-300 text-slate-950' : 'border border-white/15 text-slate-400')}>{index === 0 ? '✓' : index + 1}</span>
                  <span className="text-sm text-slate-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Made for momentum</p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {features.map((feature, index) => (
            <motion.article key={feature.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <span className="text-sm text-violet-300">0{index + 1}</span>
              <h2 className="mt-5 text-xl font-semibold">{feature.title}</h2>
              <p className="mt-3 leading-7 text-slate-400">{feature.detail}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <footer id="contact" className="mx-auto flex max-w-7xl flex-col gap-5 border-t border-white/10 px-6 py-10 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span>© 2026 Northstar. Built for what comes next.</span>
        <a href="mailto:hello@example.com" className="text-white hover:text-violet-200">Say hello <ArrowRight className="ml-1 inline" size={15} /></a>
      </footer>
    </main>
  );
}
`,
    ),
  ],
};
