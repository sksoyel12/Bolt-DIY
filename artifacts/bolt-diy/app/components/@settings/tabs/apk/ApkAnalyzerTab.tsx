import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  AlertTriangle,
  ArchiveRestore,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FileArchive,
  FileJson,
  Image,
  LockKeyhole,
  PackageSearch,
  Search,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { extractApkToWorkspace } from '~/lib/services/apkExtraction';

type FindingSeverity = 'high' | 'medium' | 'low' | 'info';

interface SecurityFinding {
  severity: FindingSeverity;
  title: string;
  detail: string;
}

interface ApkEntry {
  name: string;
  size: number;
}

interface ApkReport {
  fileName: string;
  size: number;
  sha256: string;
  entryCount: number;
  packageName: string | null;
  permissions: string[];
  manifestComponents: string[];
  exportedComponents: string[];
  urls: string[];
  firebaseReferences: string[];
  dexEntries: string[];
  nativeLibraries: string[];
  assetEntries: string[];
  resourceEntries: string[];
  certificateEntries: string[];
  fileEntries: ApkEntry[];
  findings: SecurityFinding[];
}

const severityStyles: Record<FindingSeverity, string> = {
  high: 'border-red-400/30 bg-red-400/10 text-red-200',
  medium: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  low: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
  info: 'border-white/10 bg-white/[0.04] text-white/70',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function safeArchivePath(name: string): string {
  const parts = name.replaceAll('\\', '/').split('/');
  const safeParts = parts.filter((part) => part && part !== '.' && part !== '..');
  return safeParts.join('/') || 'unnamed-file';
}

function getReadableStrings(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  const utf8 = new TextDecoder().decode(bytes);
  const utf16 = new TextDecoder('utf-16le').decode(bytes);

  return `${latin}\n${utf8}\n${utf16}`;
}

function parseBinaryManifest(bytes: Uint8Array): {
  packageName: string | null;
  permissions: string[];
  manifestComponents: string[];
  exportedComponents: string[];
} {
  if (bytes.length < 8) {
    return { packageName: null, permissions: [], manifestComponents: [], exportedComponents: [] };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readU16 = (offset: number) => view.getUint16(offset, true);
  const readU32 = (offset: number) => view.getUint32(offset, true);
  const stringPool: string[] = [];
  const stringPoolChunk = 0x0001;
  const startElementChunk = 0x0102;
  const stringType = 0x03;
  const componentNames = new Set(['activity', 'activity-alias', 'service', 'receiver', 'provider']);
  let packageName: string | null = null;
  const permissions: string[] = [];
  const manifestComponents: string[] = [];
  const exportedComponents: string[] = [];

  const readPoolString = (offset: number, utf8: boolean) => {
    if (offset >= bytes.length) {
      return '';
    }

    if (utf8) {
      const lengthBytes = bytes[offset] & 0x7f;
      const lengthOffset = (bytes[offset] & 0x80) === 0 ? 1 : 2;
      const byteLengthOffset = offset + lengthOffset + (((bytes[offset + 1] ?? 0) & 0x80) === 0 ? 1 : 2);
      return new TextDecoder().decode(bytes.slice(byteLengthOffset, byteLengthOffset + lengthBytes));
    }

    const length = readU16(offset);
    return new TextDecoder('utf-16le').decode(bytes.slice(offset + 2, offset + 2 + length * 2));
  };

  for (let offset = 0; offset + 28 <= bytes.length;) {
    const type = readU16(offset);
    const headerSize = readU16(offset + 2);
    const chunkSize = readU32(offset + 4);

    if (chunkSize < 8 || offset + chunkSize > bytes.length) {
      break;
    }

    if (type === stringPoolChunk && headerSize >= 28) {
      const stringCount = readU32(offset + 8);
      const flags = readU32(offset + 16);
      const stringsStart = readU32(offset + 20);
      const utf8 = (flags & 0x100) !== 0;

      for (let index = 0; index < stringCount; index += 1) {
        const stringOffset = readU32(offset + 28 + index * 4);
        stringPool.push(readPoolString(offset + stringsStart + stringOffset, utf8));
      }
    }

    if (type === startElementChunk && stringPool.length > 0 && offset + 36 <= bytes.length) {
      const nameIndex = readU32(offset + 20);
      const attributeStart = readU16(offset + 24);
      const attributeSize = readU16(offset + 26);
      const attributeCount = readU16(offset + 28);
      const elementName = stringPool[nameIndex] || '';
      const attributes = new Map<string, string>();

      for (let index = 0; index < attributeCount; index += 1) {
        const attributeOffset = offset + attributeStart + index * attributeSize;

        if (attributeOffset + 20 > bytes.length) {
          break;
        }

        const attributeName = stringPool[readU32(attributeOffset + 4)] || '';
        const rawValueIndex = readU32(attributeOffset + 8);
        const dataType = bytes[attributeOffset + 15];
        const data = readU32(attributeOffset + 16);
        const value =
          rawValueIndex !== 0xffffffff
            ? stringPool[rawValueIndex] || ''
            : dataType === stringType
              ? stringPool[data] || ''
              : dataType === 0x12
                ? data !== 0
                  ? 'true'
                  : 'false'
                : String(data);

        attributes.set(attributeName, value);
      }

      if (elementName === 'manifest') {
        packageName = attributes.get('package') || packageName;
      }

      if (elementName === 'uses-permission' || elementName === 'uses-permission-sdk-23') {
        const permission = attributes.get('name');

        if (permission) {
          permissions.push(
            permission.startsWith('android.permission.') ? permission : `android.permission.${permission}`,
          );
        }
      }

      if (componentNames.has(elementName)) {
        const componentName = attributes.get('name');

        if (componentName) {
          const component = `${elementName}: ${componentName}`;
          manifestComponents.push(component);

          if (attributes.get('exported') === 'true') {
            exportedComponents.push(component);
          }
        }
      }
    }

    offset += chunkSize;
  }

  return {
    packageName,
    permissions: unique(permissions),
    manifestComponents: unique(manifestComponents),
    exportedComponents: unique(exportedComponents),
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function analyzeApk(file: File): Promise<{ report: ApkReport; archive: JSZip }> {
  const archive = await JSZip.loadAsync(file);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);

  if (!archive.file('AndroidManifest.xml')) {
    throw new Error('This file is not a valid APK archive because AndroidManifest.xml was not found.');
  }

  const manifestEntry = archive.file('AndroidManifest.xml');
  const manifestBytes = manifestEntry ? new Uint8Array(await manifestEntry.async('arraybuffer')) : new Uint8Array();
  const parsedManifest = parseBinaryManifest(manifestBytes);
  const textParts = [getReadableStrings(manifestBytes)];

  for (const entry of entries.filter((item) => item.name.endsWith('.dex')).slice(0, 8)) {
    textParts.push(getReadableStrings(new Uint8Array(await entry.async('arraybuffer'))));
  }

  const searchableText = textParts.join('\n');
  const permissions = unique([
    ...parsedManifest.permissions,
    ...[...searchableText.matchAll(/android\.permission\.[A-Z0-9_]+/g)].map((match) => match[0]),
  ]);
  const urls = unique(
    [...searchableText.matchAll(/https?:\/\/[A-Za-z0-9./?=_:#%+&~-]+/g)].map((match) =>
      match[0].replace(/[),;]+$/, ''),
    ),
  ).slice(0, 100);
  const firebaseReferences = unique(
    [
      ...searchableText.matchAll(
        /[A-Za-z0-9._-]*(?:firebaseio\.com|firebaseapp\.com|googleapis\.com)[A-Za-z0-9./?=_:#%+&~-]*/gi,
      ),
    ].map((match) => match[0]),
  ).slice(0, 50);
  const packageName =
    parsedManifest.packageName ||
    searchableText.match(/package[\"'=:\s]+([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+)/)?.[1] ||
    null;
  const dexEntries = entries.map((entry) => entry.name).filter((name) => /^classes\d*\.dex$/.test(name));
  const nativeLibraries = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('lib/') && name.endsWith('.so'));
  const assetEntries = entries.map((entry) => entry.name).filter((name) => name.startsWith('assets/'));
  const resourceEntries = entries.map((entry) => entry.name).filter((name) => name.startsWith('res/'));
  const certificateEntries = entries
    .map((entry) => entry.name)
    .filter((name) => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(name));
  const fileEntries = entries
    .map((entry) => ({
      name: entry.name,
      size: (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const findings: SecurityFinding[] = [];

  if (permissions.some((permission) => /INTERNET|ACCESS_NETWORK_STATE/.test(permission))) {
    findings.push({
      severity: 'info',
      title: 'Network access requested',
      detail: 'The app can access the network. Review the discovered URLs before trusting the APK.',
    });
  }

  if (
    permissions.some((permission) =>
      /READ_SMS|SEND_SMS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|READ_CONTACTS/.test(permission),
    )
  ) {
    findings.push({
      severity: 'high',
      title: 'Sensitive permissions detected',
      detail: 'The APK requests camera, microphone, location, contacts, SMS, or similar sensitive access.',
    });
  }

  if (searchableText.includes('android:debuggable') || searchableText.includes('debuggable=true')) {
    findings.push({
      severity: 'medium',
      title: 'Debuggable marker found',
      detail: 'The package may have been built with debugging enabled. Do not install untrusted debug builds.',
    });
  }

  if (urls.some((url) => url.startsWith('http://'))) {
    findings.push({
      severity: 'medium',
      title: 'Unencrypted HTTP URL found',
      detail:
        'Some network traffic may be sent without TLS. Verify each URL and whether cleartext traffic is intentional.',
    });
  }

  if (/(AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(searchableText)) {
    findings.push({
      severity: 'high',
      title: 'Possible embedded credential found',
      detail:
        'A key-like string or private-key marker was found in the APK byte content. Rotate it if it belongs to you.',
    });
  }

  if (nativeLibraries.length > 0) {
    findings.push({
      severity: 'low',
      title: 'Native libraries included',
      detail: `${nativeLibraries.length} native .so file(s) require separate native-code review.`,
    });
  }

  if (parsedManifest.exportedComponents.length > 0) {
    findings.push({
      severity: 'info',
      title: 'Exported Android components detected',
      detail: `${parsedManifest.exportedComponents.length} activity, service, receiver, or provider component(s) are explicitly exported.`,
    });
  }

  findings.push({
    severity: 'info',
    title: 'Decompilation scope',
    detail:
      'DEX files, readable strings, URLs, resources, and native libraries were indexed in the browser. Full Java/Kotlin reconstruction requires a dedicated JADX/apktool runtime.',
  });

  return {
    archive,
    report: {
      fileName: file.name,
      size: file.size,
      sha256: await sha256(file),
      entryCount: entries.length,
      packageName,
      permissions,
      manifestComponents: parsedManifest.manifestComponents,
      exportedComponents: parsedManifest.exportedComponents,
      urls,
      firebaseReferences,
      dexEntries,
      nativeLibraries,
      assetEntries,
      resourceEntries,
      certificateEntries,
      fileEntries,
      findings,
    },
  };
}

function ListSection({ title, items, empty = 'None found' }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{title}</h3>
      {items.length > 0 ? (
        <div className="max-h-56 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-3">
          <ul className="space-y-1 font-mono text-xs text-bolt-elements-textSecondary">
            {items.map((item) => (
              <li key={item} className="break-all">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textTertiary">
          {empty}
        </p>
      )}
    </div>
  );
}

export default function ApkAnalyzerTab() {
  const [report, setReport] = useState<ApkReport | null>(null);
  const [archive, setArchive] = useState<JSZip | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [error, setError] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');

  const highRiskCount = useMemo(
    () => report?.findings.filter((finding) => finding.severity === 'high').length ?? 0,
    [report],
  );

  const handleFile = async (file?: File) => {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.apk')) {
      setError('Please select an Android APK file.');
      return;
    }

    setError('');
    setReport(null);
    setArchive(null);
    setFileSearch('');
    setWorkspacePath('');
    setIsAnalyzing(true);

    try {
      const result = await analyzeApk(file);
      setReport(result.report);
      setArchive(result.archive);
      const extraction = await extractApkToWorkspace(file);
      setWorkspacePath(extraction.rootPath);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Could not read this APK.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadEntry = async (name: string) => {
    const entry = archive?.file(name);

    if (!entry) {
      return;
    }

    const blob = await entry.async('blob');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name.split('/').pop() || 'apk-file';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadReport = () => {
    if (!report) {
      return;
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.fileName.replace(/\.apk$/i, '')}-analysis.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadUnpackedArchive = async () => {
    if (!archive || !report) {
      return;
    }

    const unpacked = new JSZip();

    for (const entry of Object.values(archive.files)) {
      if (!entry.dir) {
        unpacked.file(`unpacked/${safeArchivePath(entry.name)}`, await entry.async('uint8array'));
      }
    }

    unpacked.file('analysis/report.json', JSON.stringify(report, null, 2));
    const blob = await unpacked.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.fileName.replace(/\.apk$/i, '')}-unpacked.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const sendReportToAgent = () => {
    if (!report) {
      return;
    }

    const prompt = [
      'Analyze this Android APK statically. I am authorized to inspect it.',
      `File: ${report.fileName}`,
      `SHA-256: ${report.sha256}`,
      `Package: ${report.packageName || 'not detected'}`,
      `Permissions: ${report.permissions.join(', ') || 'none detected'}`,
      `Manifest components: ${report.manifestComponents.join('; ') || 'none detected'}`,
      `Exported components: ${report.exportedComponents.join('; ') || 'none detected'}`,
      `DEX files: ${report.dexEntries.join(', ') || 'none detected'}`,
      `Native libraries: ${report.nativeLibraries.join(', ') || 'none detected'}`,
      `Discovered URLs: ${report.urls.join(', ') || 'none detected'}`,
      `Firebase references: ${report.firebaseReferences.join(', ') || 'none detected'}`,
      `Security findings: ${report.findings.map((finding) => `${finding.severity}: ${finding.title} — ${finding.detail}`).join(' | ')}`,
      '',
      'Explain the highest-risk findings, likely app behavior, and safe next steps. Do not claim to have decompiled code that is not present in this report.',
    ].join('\n');

    window.dispatchEvent(new CustomEvent('bolt:apk-analysis', { detail: { prompt } }));
  };

  const visibleEntries =
    report?.fileEntries
      .filter((entry) => entry.name.toLowerCase().includes(fileSearch.trim().toLowerCase()))
      .slice(0, 300) || [];
  const summaryCards: Array<{ label: string; value: string; Icon: LucideIcon }> = report
    ? [
        { label: 'Package', value: report.packageName || 'Not detected', Icon: Code2 },
        { label: 'Archive entries', value: report.entryCount.toString(), Icon: FileArchive },
        { label: 'Permissions', value: report.permissions.length.toString(), Icon: LockKeyhole },
        {
          label: 'High-risk flags',
          value: highRiskCount.toString(),
          Icon: highRiskCount > 0 ? AlertTriangle : CheckCircle2,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 ring-1 ring-orange-500/30">
            <PackageSearch className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">APK Analyzer</h2>
            <p className="text-sm text-bolt-elements-textSecondary">
               Inspect an APK and unpack its resources, manifest, DEX files, and native libraries into the workspace.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {report && (
            <>
              <Button variant="outline" size="sm" onClick={sendReportToAgent}>
                <Bot className="mr-2 h-4 w-4" />
                Send to agent
              </Button>
              <Button variant="outline" size="sm" onClick={downloadReport}>
                <FileJson className="mr-2 h-4 w-4" />
                Export report
              </Button>
              <Button variant="outline" size="sm" onClick={() => void downloadUnpackedArchive()}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Download unpacked ZIP
              </Button>
            </>
          )}
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-400">
            <Upload className="h-4 w-4" />
            {isAnalyzing ? 'Analyzing...' : 'Upload APK'}
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="hidden"
              disabled={isAnalyzing}
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-purple-500/10">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
          <div className="space-y-1 text-sm text-bolt-elements-textSecondary">
            <p className="font-medium text-bolt-elements-textPrimary">Privacy-first analysis</p>
            <p>
               The APK is sent to the protected extraction route, unpacked with size and path limits, and written to a
               per-APK folder in the workspace. Binary files are preserved; readable manifest XML and a DEX index are
               also generated for the agent.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>
      )}

      {!report && !isAnalyzing && (
        <Card className="border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <FileArchive className="h-12 w-12 text-bolt-elements-textTertiary" />
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Choose an APK to inspect</h3>
            <p className="max-w-xl text-sm text-bolt-elements-textSecondary">
              You will get package metadata, decoded manifest components, permissions, URLs, Firebase references,
              assets, resources, DEX/native file inventory and security findings. The unpacked export also includes a
              structured JSON report for the agent to review.
            </p>
          </CardContent>
        </Card>
      )}

      {isAnalyzing && (
        <Card className="bg-bolt-elements-background-depth-2">
          <CardContent className="flex items-center gap-3 p-8 text-sm text-bolt-elements-textSecondary">
            <PackageSearch className="h-5 w-5 animate-pulse text-orange-400" />
            Reading APK archive and scanning bytecode strings…
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          {workspacePath && (
            <div className="rounded-lg border border-green-400/30 bg-green-400/10 p-3 text-xs text-green-200">
              Extracted into <span className="font-mono">{workspacePath}</span>. The agent can inspect these files.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(({ label, value, Icon }) => (
              <Card key={String(label)} className="bg-bolt-elements-background-depth-2">
                <CardContent className="flex items-center gap-3 p-4">
                  <Icon className="h-5 w-5 text-orange-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-bolt-elements-textTertiary">{label}</p>
                    <p className="truncate text-sm font-medium text-bolt-elements-textPrimary">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-bolt-elements-background-depth-2">
            <CardHeader>
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{report.fileName}</h3>
              <p className="break-all text-xs text-bolt-elements-textSecondary">
                {formatBytes(report.size)} · SHA-256: {report.sha256}
              </p>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <ListSection title="Permissions" items={report.permissions} />
              <ListSection title="Discovered URLs" items={report.urls} />
              <ListSection title="Firebase / Google references" items={report.firebaseReferences} />
              <ListSection title="DEX files / code containers" items={report.dexEntries} />
              <ListSection title="Native libraries" items={report.nativeLibraries} />
              <ListSection title="Manifest components" items={report.manifestComponents} />
              <ListSection title="Explicitly exported components" items={report.exportedComponents} />
              <ListSection
                title="Assets and resources"
                items={unique([...report.assetEntries, ...report.resourceEntries])}
              />
              <ListSection title="Signing certificate files" items={report.certificateEntries} />
            </CardContent>
          </Card>

          <Card className="bg-bolt-elements-background-depth-2">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Unpacked file tree</h3>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {report.fileEntries.length} files indexed
                    {fileSearch ? ` · ${visibleEntries.length} matches shown` : ''}
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bolt-elements-textTertiary" />
                  <input
                    value={fileSearch}
                    onChange={(event) => setFileSearch(event.target.value)}
                    placeholder="Search files..."
                    className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 py-2 pl-9 pr-3 text-xs text-bolt-elements-textPrimary outline-none focus:border-orange-400"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                {visibleEntries.length > 0 ? (
                  visibleEntries.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between gap-3 border-b border-bolt-elements-borderColor/60 px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-bolt-elements-textSecondary">{entry.name}</p>
                        <p className="text-[10px] text-bolt-elements-textTertiary">{formatBytes(entry.size)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Download ${entry.name}`}
                        onClick={() => void downloadEntry(entry.name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="p-6 text-center text-xs text-bolt-elements-textTertiary">No files match this search.</p>
                )}
              </div>
              {report.fileEntries.length > visibleEntries.length && (
                <p className="mt-2 text-xs text-bolt-elements-textTertiary">
                  Showing the first {visibleEntries.length} matches. Use search to narrow the file tree.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-bolt-elements-background-depth-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-orange-400" />
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Security findings</h3>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.findings.map((finding) => (
                <div
                  key={`${finding.severity}-${finding.title}`}
                  className={`rounded-lg border p-4 ${severityStyles[finding.severity]}`}
                >
                  <div className="flex items-center gap-2">
                    {finding.severity === 'high' || finding.severity === 'medium' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <p className="text-sm font-medium">{finding.title}</p>
                  </div>
                  <p className="mt-1 text-xs opacity-80">{finding.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {report.assetEntries.length > 0 && (
            <Card className="bg-bolt-elements-background-depth-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-orange-400" />
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Extractable assets</h3>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {report.assetEntries.slice(0, 100).map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    className="justify-between gap-2 overflow-hidden text-left"
                    onClick={() => void downloadEntry(name)}
                  >
                    <span className="truncate font-mono text-xs">{name}</span>
                    <Download className="h-4 w-4 shrink-0" />
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
