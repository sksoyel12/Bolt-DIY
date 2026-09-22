import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';
import { useGitHubConnection } from '~/lib/hooks';
import { GitHubAuthDialog } from './GitHubAuthDialog';

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

interface GitHubConnectionProps {
  connectionTest: ConnectionTestResult | null;
  onTestConnection: () => void;
}

export function GitHubConnection({ connectionTest, onTestConnection }: GitHubConnectionProps) {
  const { isConnected, isLoading, isConnecting, disconnect, error } = useGitHubConnection();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
          <span className="text-bolt-elements-textSecondary">Loading connection...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-bolt-elements-background dark:bg-bolt-elements-background border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="p-6 space-y-6">
        {!isConnected ? (
          <>
            <div>
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">Connect your GitHub account</h3>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                Sign in through GitHub to browse private and organization repositories. No token needs to be created or
                pasted.
              </p>
            </div>
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-700">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
            <Button
              onClick={() => setIsAuthDialogOpen(true)}
              disabled={isConnecting}
              className="flex items-center gap-2 bg-[#303030] text-white hover:bg-[#5E41D0]"
            >
              <div className="i-ph:github-logo w-4 h-4" />
              {isConnecting ? 'Connecting...' : 'Continue with GitHub'}
            </Button>
            <GitHubAuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
          </>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={disconnect}
                type="button"
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-red-500 text-white',
                  'hover:bg-red-600',
                )}
              >
                <div className="i-ph:plug w-4 h-4" />
                Disconnect
              </button>
              <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                Connected to GitHub
              </span>
            </div>
            <Button
              onClick={onTestConnection}
              disabled={connectionTest?.status === 'testing'}
              variant="outline"
              className="flex items-center gap-2"
            >
              {connectionTest?.status === 'testing' ? (
                <>
                  <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <div className="i-ph:plug-charging w-4 h-4" />
                  Test Connection
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
