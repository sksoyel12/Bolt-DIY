import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Download,
  FileArchive,
  Image,
  LockKeyhole,
  PackageSearch,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';

type FindingSeverity = 'high' | 'medium' | 'low' | 'info';

interface SecurityFinding {
  severity: FindingSeverity;
  title: string;
  detail: string;
}

interface ApkReport {
  fileName: string;
  size: number;
  sha256: string;
  entryCount: number;
  packageName: string | null;
  permissions: string[];
  urls: string[];
  firebaseReferences: string[];
  dexEntries: string[];
  nativeLibraries: string[];
  assetEntries: string[];
  resourceEntries: string[];
  certificateEntries: string[];
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

function getReadableStrings(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  const utf8 = new TextDecoder().decode(bytes);
  const utf16 = new TextDecoder('utf-16le').decode(bytes);

  return `${latin}\n${utf8}\n${utf16}`;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function analyzeApk(file: File): Promise<{ report: ApkReport; archive: JSZip }> {
  const archive = await JSZip.loadAsync(file);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  const manifestEntry = archive.file('AndroidManifest.xml');
  const manifestBytes = manifestEntry ? new Uint8Array(await manifestEntry.async('arraybuffer')) : new Uint8Array();
  const textParts = [getReadableStrings(manifestBytes)];

  for (const entry of entries.filter((item) => item.name.endsWith('.dex')).slice(0, 8)) {
    textParts.push(getReadableStrings(new Uint8Array(await entry.async('arraybuffer'))));
  }

  const searchableText = textParts.join('\n');
  const permissions = unique([...searchableText.matchAll(/android\.permission\.[A-Z0-9_]+/g)].map((match) => match[0]));
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
  const packageName = searchableText.match(/package[\"'=:\s]+([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+)/)?.[1] || null;
  const dexEntries = entries
    .map((entry) => entry.name)
    .filter((name) => /^classes\d*\.dex$/.test(name));
  const nativeLibraries = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('lib/') && name.endsWith('.so'));
  const assetEntries = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('assets/'));
  const resourceEntries = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('res/'));
  const certificateEntries = entries
    .map((entry) => entry.name)
    .filter((name) => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(name));

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
      urls,
      firebaseReferences,
      dexEntries,
      nativeLibraries,
      assetEntries,
      resourceEntries,
      certificateEntries,
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
  const [error, setError] = useState('');

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
    setIsAnalyzing(true);

    try {
      const result = await analyzeApk(file);
      setReport(result.report);
      setArchive(result.archive);
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
              Inspect an APK locally in your browser without uploading it.
            </p>
          </div>
        </div>
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

      <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-purple-500/10">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
          <div className="space-y-1 text-sm text-bolt-elements-textSecondary">
            <p className="font-medium text-bolt-elements-textPrimary">Privacy-first analysis</p>
            <p>
              APK bytes stay in this browser tab. The analyzer reads the ZIP container, indexes DEX/native files, extracts
              readable strings and reports common security indicators.
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
              You will get package metadata, permissions, URLs, Firebase references, assets, resources, DEX/native file
              inventory and security findings.
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Package', report.packageName || 'Not detected', Code2],
              ['Archive entries', report.entryCount.toString(), FileArchive],
              ['Permissions', report.permissions.length.toString(), LockKeyhole],
              ['High-risk flags', highRiskCount.toString(), highRiskCount > 0 ? AlertTriangle : CheckCircle2],
            ].map(([label, value, Icon]) => (
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
              <ListSection title="Assets and resources" items={unique([...report.assetEntries, ...report.resourceEntries])} />
              <ListSection title="Signing certificate files" items={report.certificateEntries} />
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
                <div key={`${finding.severity}-${finding.title}`} className={`rounded-lg border p-4 ${severityStyles[finding.severity]}`}>
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