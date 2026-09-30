import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = () => json({});

/**
 * Main workspace route for Bolt.
 *
 * Chat owns the workspace state and renders BaseChat. BaseChat mounts the
 * sidebar and Workbench, so keeping this route mounted at "/" is important
 * after AuthGate accepts a Firebase user.
 *
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly
        fallback={
          <div className="flex flex-1 items-center justify-center bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary">
            Loading Bolt...
          </div>
        }
      >
        {() => <Chat />}
      </ClientOnly>
    </div>
  );
}
