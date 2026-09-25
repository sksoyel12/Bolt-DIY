import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

type ExtractedFile = { path: string; content: string; encoding: 'base64'; size: number };

export type ApkExtractionResult = {
  rootPath: string;
  files: number;
  manifestPath: string;
  dexIndexPath: string;
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function safeName(name: string): string {
  return (
    name
      .replace(/\.apk$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'apk'
  );
}

export async function extractApkToWorkspace(file: File): Promise<ApkExtractionResult> {
  const body = new FormData();
  body.append('file', file, file.name);
  const response = await fetch('/api/apk-extract', { method: 'POST', body });
  const payload = (await response.json()) as {
    error?: string;
    fileName?: string;
    files?: ExtractedFile[];
    manifestText?: string;
    dexIndex?: unknown[];
  };

  if (!response.ok || !payload.files || !payload.manifestText || !payload.dexIndex) {
    throw new Error(payload.error || 'APK extraction failed');
  }

  const rootPath = `${WORK_DIR}/apk-analysis/${safeName(payload.fileName || file.name)}`;

  for (const entry of payload.files) {
    await workbenchStore.createFile(`${rootPath}/${entry.path}`, decodeBase64(entry.content));
  }

  const manifestPath = `${rootPath}/analysis/AndroidManifest.xml`;
  const dexIndexPath = `${rootPath}/analysis/dex-index.json`;
  await workbenchStore.createFile(manifestPath, payload.manifestText);
  await workbenchStore.createFile(dexIndexPath, JSON.stringify(payload.dexIndex, null, 2));

  return { rootPath, files: payload.files.length, manifestPath, dexIndexPath };
}