import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { getGithubAccessToken, signInWithGithub } from '~/lib/firebase.client';
import { connectGitHubWithOAuthToken } from '~/lib/stores/github';

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function GitHubAuthDialog({ isOpen, onClose, onSuccess }: GitHubAuthDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setIsConnecting(true);

    try {
      const result = await signInWithGithub();
      const accessToken = getGithubAccessToken(result);

      if (!accessToken) {
        throw new Error('GitHub did not return repository access. Please try again.');
      }

      await connectGitHubWithOAuthToken(accessToken);
      onSuccess?.();
      onClose();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'GitHub sign-in failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[200]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-full max-w-md"
          onEscapeKeyDown={handleClose}
          onPointerDownOutside={handleClose}
        >
          <motion.div
            className="bg-bolt-elements-background border border-bolt-elements-borderColor rounded-lg shadow-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Connect to GitHub</h2>
                <button
                  onClick={handleClose}
                  className="p-1 rounded-md hover:bg-bolt-elements-item-backgroundActive/10"
                >
                  <div className="i-ph:x w-4 h-4 text-bolt-elements-textSecondary" />
                </button>
              </div>

              <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 p-3 rounded-lg">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success" />
                  <span className="font-medium">Secure sign-in:</span> GitHub will ask for permission in a popup.
                </p>
                <p>No personal access token needs to be created or pasted.</p>
              </div>

              <form onSubmit={handleConnect} className="space-y-4">
                {error && (
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-700">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                      'bg-[#303030] text-white',
                      'hover:bg-[#5E41D0] hover:text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                    )}
                  >
                    {isConnecting ? (
                      <>
                        <div className="i-ph:spinner-gap animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <div className="i-ph:github-logo w-4 h-4" />
                        Continue with GitHub
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
