import { useState, type ChangeEvent } from 'react';
import type { Message } from 'ai';
import JSZip from 'jszip';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { createChatFromArtifacts } from '~/utils/folderImport';
import { shouldIncludeFile } from '~/utils/fileUtils';
import { classNames } from '~/utils/classNames';

interface ImportZipButtonProps {
  importChat?: (description: string, messages: Message[]) => Promise<void>;
}

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORTED_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 500;

function safeZipPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    return undefined;
  }

  const parts = normalized.split('/').filter(Boolean);

  if (parts.some((part) => part === '..' || part === '.')) {
    return undefined;
  }

  return parts.join('/');
}

function looksBinary(bytes: Uint8Array): boolean {
  return bytes.slice(0, 1024).some((byte) => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13));
}

export function ImportZipButton({ importChat }: ImportZipButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const archiveFile = event.target.files?.[0];

    if (!archiveFile) {
      return;
    }

    event.target.value = '';

    if (!importChat) {
      toast.error('Project import is not available right now');
      return;
    }

    if (!archiveFile.name.toLowerCase().endsWith('.zip')) {
      toast.error('Choose a .zip project archive');
      return;
    }

    if (archiveFile.size > MAX_ARCHIVE_BYTES) {
      toast.error('ZIP files must be smaller than 25 MB');
      return;
    }

    setIsLoading(true);

    const loadingToast = toast.loading('Extracting project files…');

    try {
      const archive = await JSZip.loadAsync(archiveFile);
      const entries = Object.entries(archive.files).filter(([, entry]) => !entry.dir);
      const firstSegments = entries
        .map(([name]) => name.split('/').filter(Boolean)[0])
        .filter((part): part is string => Boolean(part));
      const commonRoot =
        firstSegments.length === entries.length && new Set(firstSegments).size === 1 && entries.length > 0
          ? `${firstSegments[0]}/`
          : '';
      const importedFiles: Array<{ path: string; content: string }> = [];
      const skippedFiles: string[] = [];
      let totalBytes = 0;

      for (const [archivePath, entry] of entries) {
        const unprefixed =
          commonRoot && archivePath.startsWith(commonRoot) ? archivePath.slice(commonRoot.length) : archivePath;
        const filePath = safeZipPath(unprefixed);

        if (!filePath || !shouldIncludeFile(filePath)) {
          continue;
        }

        if (importedFiles.length + skippedFiles.length >= MAX_ARCHIVE_FILES) {
          skippedFiles.push(`${filePath} (project file limit reached)`);
          continue;
        }

        const uncompressedSize = Number(
          (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
        );

        if (uncompressedSize > MAX_IMPORTED_FILE_BYTES) {
          skippedFiles.push(`${filePath} (larger than 256 KB)`);
          continue;
        }

        const bytes = await entry.async('uint8array');

        if (looksBinary(bytes)) {
          skippedFiles.push(`${filePath} (binary file)`);
          continue;
        }

        if (bytes.byteLength > MAX_IMPORTED_FILE_BYTES || totalBytes + bytes.byteLength > MAX_TOTAL_TEXT_BYTES) {
          skippedFiles.push(`${filePath} (project text limit reached)`);
          continue;
        }

        try {
          const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          importedFiles.push({ path: filePath, content });
          totalBytes += bytes.byteLength;
        } catch {
          skippedFiles.push(`${filePath} (not UTF-8 text)`);
        }
      }

      if (importedFiles.length === 0) {
        throw new Error('No readable project files were found in that ZIP.');
      }

      const messages = await createChatFromArtifacts(
        importedFiles,
        skippedFiles,
        archiveFile.name.replace(/\.zip$/i, ''),
      );
      await importChat(archiveFile.name.replace(/\.zip$/i, ''), messages);
      toast.success(`Imported ${importedFiles.length} text files into the workspace`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import ZIP project');
    } finally {
      setIsLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  return (
    <>
      <input
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        aria-label="Choose a ZIP project archive"
        onChange={handleFileChange}
      />
      <Button
        onClick={(event) => {
          const input = event.currentTarget.parentElement?.querySelector('input[type="file"]');
          (input as HTMLInputElement | null)?.click();
        }}
        title="Import a ZIP project"
        variant="default"
        size="lg"
        className={classNames(
          'gap-2 bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary',
          'hover:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
          'h-10 px-4 py-2 min-w-[120px] justify-center transition-all duration-200 ease-in-out',
        )}
        disabled={isLoading || !importChat}
      >
        <span className="i-ph:file-zip w-4 h-4" />
        {isLoading ? 'Extracting…' : 'Import ZIP'}
      </Button>
    </>
  );
}
