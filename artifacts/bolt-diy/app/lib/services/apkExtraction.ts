import { promises as fs } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';

function execFileAsync(command: string, args: string[], options: ExecFileOptions = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const output = [String(stderr || ''), String(stdout || '')].filter(Boolean).join('\n');

        if (output) {
          error.message = `${error.message}\n${output}`;
        }

        reject(error);

        return;
      }

      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Bolt-DIY-APK-Analyzer',
  'X-GitHub-Api-Version': '2022-11-28',
};

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_OUTPUT_FILES = 10_000;
const MAX_OUTPUT_BYTES = 400 * 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = 80 * 1024 * 1024;
const TOOL_ROOT = path.join(process.cwd(), '.apk-tools');
const WORKSPACE_ROOT = process.env.APK_WORKSPACE_ROOT?.trim() || path.join(process.cwd(), '.apk-workspace');

export type ApkExtractionStage =
  'preparing' | 'downloading-tools' | 'decoding-resources' | 'decompiling-java' | 'collecting-files' | 'complete';

export type ApkToolchain = {
  jadxVersion: string;
  apktoolVersion: string;
};

export type ApkManifestInfo = {
  packageName: string | null;
  permissions: string[];
  versionName: string | null;
  versionCode: string | null;
  minSdk: string | null;
  targetSdk: string | null;
};

export type ApkExtractionFile = {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
};

export type ApkExtractionResult = {
  fileName: string;
  workspaceName: string;
  workspaceRoot: string;
  decodedRoot: string;
  sourceRoot: string;
  manifestPath: string;
  entryFilePath: string | null;
  manifest: ApkManifestInfo;
  tools: ApkToolchain;
  warnings: string[];
  files: ApkExtractionFile[];
  decodedFileCount: number;
  sourceFileCount: number;
};

type GithubRelease = {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

type ToolchainPaths = {
  tools: ApkToolchain;
  jadxBinary: string;
  apktoolJar: string;
};

type ProgressCallback = (stage: ApkExtractionStage) => void;

function safeName(name: string): string {
  return (
    name
      .replace(/\.apk$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'apk'
  );
}

function safeRelativePath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  const parts = normalized.split('/');

  if (normalized.startsWith('/') || parts.some((part) => part === '..')) {
    throw new Error(`Unsafe extracted path: ${filePath}`);
  }

  return parts.filter((part) => part && part !== '.').join('/');
}

async function fetchRelease(repository: string): Promise<GithubRelease> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: GITHUB_API_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`GitHub could not provide the latest ${repository} release (${response.status}).`);
  }

  return (await response.json()) as GithubRelease;
}

async function downloadReleaseAsset(url: string, destination: string) {
  const response = await fetch(url, {
    headers: {
      ...GITHUB_API_HEADERS,
      Accept: 'application/octet-stream',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Could not download APK analysis tool (${response.status}).`);
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function findFile(root: string, fileName: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isFile() && entry.name === fileName) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const match = await findFile(entryPath, fileName);

      if (match) {
        return match;
      }
    }
  }

  return null;
}

async function ensureToolchain(onProgress?: ProgressCallback): Promise<ToolchainPaths> {
  onProgress?.('downloading-tools');
  await mkdir(TOOL_ROOT, { recursive: true });

  const [jadxRelease, apktoolRelease] = await Promise.all([
    fetchRelease('skylot/jadx'),
    fetchRelease('iBotPeaches/Apktool'),
  ]);
  const jadxAsset = jadxRelease.assets.find((asset) => /^jadx-[^/]+\.zip$/i.test(asset.name));
  const apktoolAsset = apktoolRelease.assets.find((asset) => /^apktool[_-][^/]+\.jar$/i.test(asset.name));

  if (!jadxAsset) {
    throw new Error(`The latest JADX release (${jadxRelease.tag_name}) has no Linux/macOS ZIP asset.`);
  }

  if (!apktoolAsset) {
    throw new Error(`The latest Apktool release (${apktoolRelease.tag_name}) has no executable JAR asset.`);
  }

  const jadxDir = path.join(TOOL_ROOT, `jadx-${jadxRelease.tag_name.replace(/^v/, '')}`);
  let jadxBinary = (await exists(jadxDir)) ? await findFile(jadxDir, 'jadx') : null;
  const apktoolJar = path.join(TOOL_ROOT, apktoolAsset.name);

  if (!jadxBinary) {
    const archivePath = path.join(TOOL_ROOT, `${jadxAsset.name}.download`);
    await rm(jadxDir, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await downloadReleaseAsset(jadxAsset.browser_download_url, archivePath);
    await mkdir(jadxDir, { recursive: true });
    await execFileAsync('unzip', ['-q', archivePath, '-d', jadxDir], { maxBuffer: 4 * 1024 * 1024 });
    await rm(archivePath, { force: true });

    const discoveredBinary = await findFile(jadxDir, 'jadx');

    if (!discoveredBinary) {
      throw new Error(`The latest JADX release (${jadxRelease.tag_name}) did not contain bin/jadx.`);
    }

    jadxBinary = discoveredBinary;
  }

  await chmod(jadxBinary, 0o755);

  if (!(await exists(apktoolJar))) {
    const downloadPath = `${apktoolJar}.download`;
    await rm(downloadPath, { force: true });
    await downloadReleaseAsset(apktoolAsset.browser_download_url, downloadPath);
    await fs.rename(downloadPath, apktoolJar);
  }

  await execFileAsync('java', ['-version'], { maxBuffer: 2 * 1024 * 1024 }).catch(() => {
    throw new Error('Java is required to run Apktool but was not found in the server runtime.');
  });

  return {
    tools: {
      jadxVersion: jadxRelease.tag_name,
      apktoolVersion: apktoolRelease.tag_name,
    },
    jadxBinary,
    apktoolJar,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function readAttribute(tag: string, attribute: string): string | null {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'));

  return match?.[1] || null;
}

function readFirstAttribute(tags: string[], attributes: string[]): string | null {
  for (const tag of tags) {
    for (const attribute of attributes) {
      const value = readAttribute(tag, attribute);

      if (value) {
        return value;
      }
    }
  }

  return null;
}

function parseManifest(manifestText: string): ApkManifestInfo {
  /*
   * Apktool and JADX can both emit a readable manifest, but they do not
   * always preserve the same attributes. In particular, Apktool's decoded
   * root may omit version/SDK metadata while JADX's resources copy retains
   * it. Parse every matching tag and take the first non-empty value so the
   * two outputs are merged instead of trusting whichever file appeared first.
   */
  const manifestTags = [...manifestText.matchAll(/<manifest\b[^>]*>/gi)].map((match) => match[0]);
  const usesSdkTags = [...manifestText.matchAll(/<uses-sdk\b[^>]*>/gi)].map((match) => match[0]);
  const permissionMatches = [...manifestText.matchAll(/<uses-permission(?:-sdk-\d+)?\b[^>]*>/gi)];
  const permissions = permissionMatches
    .map((match) => readAttribute(match[0], 'android:name') || readAttribute(match[0], 'name'))
    .filter((permission): permission is string => Boolean(permission))
    .sort();

  return {
    packageName: readFirstAttribute(manifestTags, ['package']),
    permissions: [...new Set(permissions)],
    versionName: readFirstAttribute(manifestTags, ['android:versionName', 'versionName']),
    versionCode: readFirstAttribute(manifestTags, ['android:versionCode', 'versionCode']),
    minSdk: readFirstAttribute(usesSdkTags, ['android:minSdkVersion', 'minSdkVersion']),
    targetSdk: readFirstAttribute(usesSdkTags, ['android:targetSdkVersion', 'targetSdkVersion']),
  };
}

function isLikelyText(bytes: Buffer): boolean {
  if (bytes.includes(0)) {
    return false;
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root: string, prefix: string): Promise<ApkExtractionFile[]> {
  const files: ApkExtractionFile[] = [];
  let totalBytes = 0;

  async function visit(currentRoot: string, currentPrefix: string) {
    const entries = await readdir(currentRoot, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(currentRoot, entry.name);
      const relativePath = safeRelativePath(`${currentPrefix}/${entry.name}`);

      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (files.length >= MAX_OUTPUT_FILES) {
        throw new Error(`The decoded project contains too many files (maximum ${MAX_OUTPUT_FILES}).`);
      }

      const bytes = await readFile(absolutePath);

      if (bytes.byteLength > MAX_OUTPUT_FILE_BYTES || totalBytes + bytes.byteLength > MAX_OUTPUT_BYTES) {
        throw new Error('The decoded project exceeds the safe workbench size limit.');
      }

      totalBytes += bytes.byteLength;
      files.push({
        path: relativePath,
        content: isLikelyText(bytes) ? bytes.toString('utf8') : bytes.toString('base64'),
        encoding: isLikelyText(bytes) ? 'utf8' : 'base64',
        size: bytes.byteLength,
      });
    }
  }

  await visit(root, prefix);

  return files;
}

async function hasAnyFiles(root: string): Promise<boolean> {
  if (!(await exists(root))) {
    return false;
  }

  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      return true;
    }

    if (entry.isDirectory() && (await hasAnyFiles(path.join(root, entry.name)))) {
      return true;
    }
  }

  return false;
}

export async function extractApkWithTools(file: File, onProgress?: ProgressCallback): Promise<ApkExtractionResult> {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`APK exceeds the ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB upload limit.`);
  }

  if (!file.name.toLowerCase().endsWith('.apk')) {
    throw new Error('Only .apk files are accepted.');
  }

  onProgress?.('preparing');

  const tools = await ensureToolchain(onProgress);
  const jobName = `${safeName(file.name)}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const workspaceRoot = path.join(WORKSPACE_ROOT, 'apk-analysis', jobName);
  const decodedRoot = path.join(workspaceRoot, 'apk_decoded');
  const sourceRoot = path.join(workspaceRoot, 'apk_src');
  const inputPath = path.join(workspaceRoot, `${safeName(file.name)}.apk`);
  const warnings: string[] = [];

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

  onProgress?.('decoding-resources');
  await execFileAsync('java', ['-jar', tools.apktoolJar, 'd', '--force', '-o', decodedRoot, inputPath], {
    cwd: workspaceRoot,
    maxBuffer: 12 * 1024 * 1024,
  });

  onProgress?.('decompiling-java');

  try {
    await execFileAsync(tools.jadxBinary, ['-d', sourceRoot, inputPath], {
      cwd: workspaceRoot,
      maxBuffer: 12 * 1024 * 1024,
    });
  } catch (error) {
    if (!(await hasAnyFiles(sourceRoot))) {
      throw error;
    }

    warnings.push('JADX reported one or more decompilation warnings; generated source files are still available.');
  }

  onProgress?.('collecting-files');

  const [decodedFiles, sourceFiles] = await Promise.all([
    collectFiles(decodedRoot, 'apk_decoded'),
    collectFiles(sourceRoot, 'apk_src'),
  ]);
  const files = [...decodedFiles, ...sourceFiles];
  const manifestRelativePath = 'apk_decoded/AndroidManifest.xml';
  const manifestFile = decodedFiles.find((entry) => entry.path === manifestRelativePath);

  if (!manifestFile || manifestFile.encoding !== 'utf8') {
    throw new Error('Apktool did not produce a readable AndroidManifest.xml.');
  }

  const sourceManifestFile = sourceFiles.find(
    (entry) => entry.path === 'apk_src/resources/AndroidManifest.xml' && entry.encoding === 'utf8',
  );
  const manifest = parseManifest([manifestFile.content, sourceManifestFile?.content].filter(Boolean).join('\n'));
  const sourceEntries = sourceFiles.filter(
    (entry) => entry.path.startsWith('apk_src/sources/') && /\.(java|kt)$/i.test(entry.path),
  );
  const packageSourcePrefix = manifest.packageName
    ? `apk_src/sources/${manifest.packageName.replaceAll('.', '/')}/`
    : null;
  const firstSource =
    sourceEntries.find((entry) => packageSourcePrefix && entry.path.startsWith(packageSourcePrefix))?.path ||
    sourceEntries[0]?.path ||
    manifestRelativePath;
  const relativeWorkspaceRoot = path.relative(process.cwd(), workspaceRoot).replaceAll(path.sep, '/');

  onProgress?.('complete');

  return {
    fileName: file.name,
    workspaceName: jobName,
    workspaceRoot: `/${relativeWorkspaceRoot}`,
    decodedRoot: `/${path.relative(process.cwd(), decodedRoot).replaceAll(path.sep, '/')}`,
    sourceRoot: `/${path.relative(process.cwd(), sourceRoot).replaceAll(path.sep, '/')}`,
    manifestPath: manifestRelativePath,
    entryFilePath: firstSource,
    manifest,
    tools: tools.tools,
    warnings,
    files,
    decodedFileCount: decodedFiles.length,
    sourceFileCount: sourceFiles.length,
  };
}
