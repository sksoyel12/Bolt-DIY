import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

type ExtractedFile = {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
};

export type ApkExtractionProgressStage =
  | 'preparing'
  | 'downloading-tools'
  | 'decoding-resources'
  | 'decompiling-java'
  | 'collecting-files'
  | 'complete';

export type ApkExtractionResult = {
  rootPath: string;
  files: number;
  manifestPath: string;
  entryFilePath: string | null;
  manifest: {
    packageName: string | null;
    permissions: string[];
    versionName: string | null;
    versionCode: string | null;
    minSdk: string | null;
    targetSdk: string | null;
  };
  tools: {
    jadxVersion: string;
    apktoolVersion: string;
  };
  warnings: string[];
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

export async function extractApkToWorkspace(
  file: File,
  onProgress?: (stage: ApkExtractionProgressStage) => void,
): Promise<ApkExtractionResult> {
  const body = new FormData();
  body.append('file', file, file.name);
  const response = await fetch('/api/apk-extract', { method: 'POST', body });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'APK extraction failed');
  }

  if (!response.body) {
    throw new Error('The APK extraction server did not return a progress stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  type ExtractionPayload = {
    fileName: string;
    workspaceName: string;
    files: ExtractedFile[];
    manifest: ApkExtractionResult['manifest'];
    tools: ApkExtractionResult['tools'];
    warnings: string[];
    manifestPath: string;
    entryFilePath: string | null;
  };
  let result: ExtractionPayload | undefined;

  const processLine = (line: string) => {
    if (!line.trim()) {
      return;
    }

    const message = JSON.parse(line) as
      | { type: 'progress'; stage: ApkExtractionProgressStage }
      | { type: 'result'; payload: ExtractionPayload }
      | { type: 'error'; error: string };

    if (message.type === 'progress') {
      onProgress?.(message.stage);
    } else if (message.type === 'error') {
      throw new Error(message.error);
    } else if (message.payload) {
      result = message.payload;
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      processLine(line);
    }
  }

  buffer += decoder.decode();
  processLine(buffer);

  if (!result) {
    throw new Error('APK extraction completed without a result.');
  }

  const rootPath = `${WORK_DIR}/apk-analysis/${result.workspaceName || safeName(result.fileName)}`;

  for (const entry of result.files) {
    const filePath = `${rootPath}/${entry.path}`;
    await workbenchStore.createFile(
      filePath,
      entry.encoding === 'base64' ? decodeBase64(entry.content) : entry.content,
    );
  }

  const entryFilePath = result.entryFilePath ? `${rootPath}/${result.entryFilePath}` : null;

  return {
    rootPath,
    files: result.files.length,
    manifestPath: `${rootPath}/${result.manifestPath}`,
    entryFilePath,
    manifest: result.manifest,
    tools: result.tools,
    warnings: result.warnings,
  };
}