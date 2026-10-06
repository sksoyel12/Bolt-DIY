import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { installFirebaseApiAuthFetch } from './lib/firebase.client';

installFirebaseApiAuthFetch();

startTransition(() => {
  hydrateRoot(document.getElementById('root')!, <RemixBrowser />);
});
