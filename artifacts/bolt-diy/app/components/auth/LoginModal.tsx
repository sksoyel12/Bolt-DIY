import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { SiGithub, SiGoogle } from 'react-icons/si';
import { FiMail } from 'react-icons/fi';
import type { User } from 'firebase/auth';
import {
  clearCachedFirebaseUser,
  createAccountWithEmail,
  firebaseAuthConfigured,
  getCachedFirebaseUser,
  getGithubAccessToken,
  getFirebaseRedirectResult,
  logFirebaseAuthError,
  observeFirebaseUser,
  persistFirebaseUserSession,
  signInWithEmail,
  signInWithGithub,
  signInWithGithubRedirect,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOut,
  type CachedFirebaseUser,
  updateFirebaseAuthState,
} from '~/lib/firebase.client';
import { connectGitHubWithOAuthToken } from '~/lib/stores/github';
import { isMobile } from '~/utils/mobile';

const AUTH_INITIALIZATION_TIMEOUT_MS = 3500;

const friendlyAuthError = (error: unknown) => {
  const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'The sign-in window was closed. Use Continue with Email, or allow pop-ups and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups or use Continue with Email.';
    case 'auth/unauthorized-domain':
      return 'This Preview domain is not authorized in Firebase. Add the current Replit domain in Firebase Authentication settings.';
    case 'auth/operation-not-supported-in-this-environment':
      return 'This browser does not support popup sign-in. Use Continue with Email.';
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'This email already has an account. Switch to Sign in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase yet.';
    default:
      return error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
  }
};

export function LoginModal() {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const socialSignIn = async (
    provider: () => Promise<unknown>,
    redirectProvider: () => Promise<unknown>,
    isGithub = false,
  ) => {
    setError('');
    setIsSubmitting(true);

    try {
      /*
       * Mobile Chrome often opens popup auth in a separate tab and loses the
       * opener before Firebase can deliver the credential back to this app.
       * Use the redirect flow directly on small touch screens instead of
       * waiting for the popup to fail and leaving the user on a blank callback
       * page.
       */
      if (isMobile()) {
        await redirectProvider();
        return;
      }

      const result = await provider();

      if (isGithub && result) {
        const accessToken = getGithubAccessToken(result as Awaited<ReturnType<typeof signInWithGithub>>);

        if (!accessToken) {
          throw new Error('GitHub did not return repository access. Please try again.');
        }

        await connectGitHubWithOAuthToken(accessToken);
      }

      if (isUserCredential(result)) {
        await persistFirebaseUserSession(result.user);
        navigateToMainChat();
      }
    } catch (authError) {
      if (isPopupError(authError)) {
        try {
          await redirectProvider();
          return;
        } catch (redirectError) {
          logFirebaseAuthError('redirect sign-in', redirectError);
          setError(friendlyAuthError(redirectError));
        }
      } else {
        logFirebaseAuthError('popup sign-in', authError);
        setError(friendlyAuthError(authError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const emailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      let credential;

      if (isCreatingAccount) {
        credential = await createAccountWithEmail(email.trim(), password);
      } else {
        credential = await signInWithEmail(email.trim(), password);
      }

      await persistFirebaseUserSession(credential.user);
      navigateToMainChat();
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!firebaseAuthConfigured) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/70 p-7 text-white shadow-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Bolt DIY</p>
          <h1 className="text-2xl font-semibold">Firebase sign-in needs configuration</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Add the VITE_FIREBASE_* values for your Firebase web app to enable Google and GitHub access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-6 text-white shadow-2xl shadow-violet-950/50 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <div className="mb-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Bolt DIY</p>
            <h1 className="text-3xl font-semibold tracking-tight">Build without losing your flow.</h1>
            <p className="mt-2 text-sm text-white/55">Sign in to keep chats, projects, and preferences together.</p>
          </div>

          <div className="space-y-3">
            <SocialButton
              label="Continue with Google"
              icon={<SiGoogle />}
              onClick={() => socialSignIn(signInWithGoogle, signInWithGoogleRedirect)}
              disabled={isSubmitting}
            />
            <SocialButton
              label="Continue with GitHub"
              icon={<SiGithub />}
              onClick={() => socialSignIn(signInWithGithub, signInWithGithubRedirect, true)}
              disabled={isSubmitting}
            />
            <SocialButton
              label="Continue with Email"
              icon={<FiMail />}
              onClick={() => {
                setError('');
                setShowEmailForm((current) => !current);
              }}
              disabled={isSubmitting}
            />
            {showEmailForm && (
              <form className="space-y-3 pt-1" onSubmit={emailSignIn}>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-300/60"
                />
                <input
                  type="password"
                  autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-300/60"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'Please wait...' : isCreatingAccount ? 'Create account' : 'Sign in'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setError('');
                    setIsCreatingAccount((current) => !current);
                  }}
                  className="w-full text-center text-xs text-violet-200/80 transition hover:text-violet-100 disabled:opacity-50"
                >
                  {isCreatingAccount ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
              </form>
            )}
            {error && (
              <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75 transition hover:border-violet-300/40 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | CachedFirebaseUser | null>(() => getCachedFirebaseUser());
  const [ready, setReady] = useState(() => !firebaseAuthConfigured || Boolean(getCachedFirebaseUser()));

  useEffect(() => {
    if (!firebaseAuthConfigured) {
      return undefined;
    }

    let cancelled = false;
    let authStateResolved = false;
    let redirectResultResolved = false;
    let resolvedUser: User | null = null;
    let redirectUser: User | null = null;

    const finishInitialization = () => {
      if (!cancelled && authStateResolved && redirectResultResolved) {
        setReady(true);
      }
    };

    const commitAuthenticatedUser = (nextUser: User) => {
      if (cancelled) {
        return;
      }

      resolvedUser = nextUser;
      setUser(nextUser);
      setReady(true);
      updateFirebaseAuthState(nextUser);
      void persistFirebaseUserSession(nextUser);
    };

    let unsubscribe: () => void = () => undefined;

    try {
      unsubscribe = observeFirebaseUser((nextUser) => {
        if (cancelled) {
          return;
        }

        if (nextUser) {
          commitAuthenticatedUser(nextUser);
        } else if (redirectResultResolved && !redirectUser) {
          resolvedUser = null;
          setUser(null);
          clearCachedFirebaseUser();
          updateFirebaseAuthState(null);
        }

        authStateResolved = true;
        finishInitialization();
      });
    } catch {
      authStateResolved = true;
    }

    void getFirebaseRedirectResult()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result) {
          redirectUser = result.user;
          commitAuthenticatedUser(result.user);
          navigateToMainChat();

          const accessToken = getGithubAccessToken(result);

          if (accessToken) {
            void connectGitHubWithOAuthToken(accessToken).catch(() => undefined);
          }
        } else if (!resolvedUser) {
          clearCachedFirebaseUser();
        }
      })
      .catch((error) => {
        logFirebaseAuthError('getRedirectResult', error);
      })
      .finally(() => {
        redirectResultResolved = true;

        if (!resolvedUser && !redirectUser && authStateResolved && !cancelled) {
          setUser(null);
          clearCachedFirebaseUser();
          updateFirebaseAuthState(null);
        }

        finishInitialization();
      });

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setReady(true);
      }
    }, AUTH_INITIALIZATION_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log('[Auth Debug] Current User:', user?.email);

    if (ready && user) {
      console.log('[Auth Debug] Target View: Mounting Main Workbench & Chat');
    }
  }, [ready, user]);

  const isAuthenticated = ready && Boolean(user);

  if (isAuthenticated && user) {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="min-h-screen bg-[#08070c]" />;
  }

  return <LoginModal />;
}

export function AuthUserBadge() {
  const [user, setUser] = useState<User | CachedFirebaseUser | null>(() => getCachedFirebaseUser());

  useEffect(() => {
    if (!firebaseAuthConfigured) {
      return undefined;
    }

    return observeFirebaseUser((nextUser) => {
      setUser(nextUser);

      if (nextUser) {
        void persistFirebaseUserSession(nextUser);
      }
    });
  }, []);

  if (!firebaseAuthConfigured || !user) {
    return null;
  }

  const displayName = user.displayName || user.email || 'Signed in';
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      title={`${displayName} — sign out`}
      className="ml-3 flex max-w-[180px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-left transition hover:bg-white/10"
      onClick={() => signOut().catch(() => undefined)}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/30 text-xs font-semibold text-violet-100">
          {initials}
        </span>
      )}
      <span className="truncate text-xs text-white/70">{displayName}</span>
    </button>
  );
}

function isPopupError(error: unknown) {
  const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/popup-blocked';
}

function isUserCredential(value: unknown): value is { user: User } {
  return Boolean(value && typeof value === 'object' && 'user' in value && (value as { user?: unknown }).user);
}

function navigateToMainChat() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.history.replaceState({}, document.title, '/');
  }
}

/* Firebase auth state is intentionally kept in the client for this app shell. */
