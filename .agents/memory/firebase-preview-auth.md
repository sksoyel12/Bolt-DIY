---
name: Firebase preview auth
description: Firebase OAuth popups are unreliable in mobile or embedded Replit previews.
---

Firebase social sign-in should prefer `signInWithRedirect` on mobile or when the app is embedded, while keeping popup sign-in for desktop and falling back to redirect when the popup is blocked or closed. The app must resolve the redirect result on startup.

**Why:** Mobile browsers and credentialless preview frames can close or block OAuth popups even when the Firebase configuration is otherwise valid.

**How to apply:** Keep email/password available as a no-popup fallback, and surface Firebase `auth/unauthorized-domain` clearly when the preview domain has not been added to Firebase Authentication authorized domains.

Auth gates should hydrate from a small cached user snapshot and release loading only after both the redirect result and auth-state listener settle, with a short timeout fallback. Never let a missing Firebase callback leave the entire app behind a permanent loading screen.

**Why:** Redirect returns can resolve in a different order from `onAuthStateChanged`, and a delayed or unavailable callback otherwise produces a black screen after successful OAuth.

**How to apply:** Cache only non-sensitive identity fields (`uid`, email, display name, photo URL), update the cache from every confirmed Firebase user, clear it on sign-out, and treat it as an optimistic render hint until Firebase confirms the session.

Configure `browserLocalPersistence` before starting popup, redirect, email, or GitHub sign-in, and process `getRedirectResult` during the first client auth effect.

**Why:** Mobile redirect returns can otherwise lose the Firebase session between the provider callback and the app's auth listener, which looks like an immediate login loop.

**How to apply:** Share one cached persistence promise across auth operations, log persistence and redirect failures with their Firebase error codes, and do not turn an in-flight auth `null` callback into a login reset.