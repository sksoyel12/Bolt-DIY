import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import JSZip from 'jszip';

const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
const MAX_FILES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;

type ExtractedFile = {
  path: string;
  content: string;
  encoding: 'base64';
  size: number;
};

function safePath(name: string): string {
  const normalized = name.replaceAll('\\', '/');
  const parts = normalized.split('/');

  if (normalized.startsWith('/') || parts.some((part) => part === '..')) {
    throw new Error(`Unsafe archive path: ${name}`);
  }

  const result = parts.filter((part) => part && part !== '.').join('/');

  if (!result) {
    throw new Error('Archive contains an empty file path');
  }

  return result;
}

function readableStrings(bytes: Uint8Array): string[] {
  const values = new Set<string>();
  const decoders = [new TextDecoder('utf-8'), new TextDecoder('latin1'), new TextDecoder('utf-16le')];

  for (const decoder of decoders) {
    for (const value of decoder.decode(bytes).split(/[\0\r\n\t]+/)) {
      const text = value.trim();

      if (text.length >= 3 && /[\p{L}\p{N}]/u.test(text)) {
        values.add(text.slice(0, 500));
      }
    }
  }

  return [...values];
}

function manifestAsReadableXml(bytes: Uint8Array): string {
  const strings = readableStrings(bytes);
  const packageName =
    strings.find((value) => /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*){1,}$/.test(value) && !value.includes('android.')) ||
    'unknown.package';
  const permissions = strings.filter((value) => value.includes('permission.') || value.startsWith('android.permission.'));
  const components = strings.filter((value) => /(?:activity|service|receiver|provider|application)/i.test(value));

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Readable inspection view generated from Android binary XML. Values are best-effort; the original binary is preserved alongside this file. -->',
    `<manifest package="${packageName}">`,
    ...permissions.slice(0, 200).map((permission) => `  <uses-permission android:name="${permission}" />`),
    ...components.slice(0, 200).map((component) => `  <!-- component: ${component.replaceAll('--', '')} -->`),
    '</manifest>',
  ].join('\n');
}

function dexIndex(bytes: Uint8Array, path: string) {
  const strings = readableStrings(bytes);
  const classes = strings.filter((value) => /^(?:[a-zA-Z_$][\w$]*\.){2,}[a-zA-Z_$][\w$]*$/.test(value));
  const urls = strings
    .flatMap((value) => value.match(/https?:\/\/[^\s"'<>]+/g) || [])
    .map((url) => url.replace(/[),.;]+$/, ''));

  return {
    path,
    classes: [...new Set(classes)].slice(0, 2_000),
    strings: strings.slice(0, 10_000),
    urls: [...new Set(urls)].slice(0, 500),
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const uploaded = formData.get('file');

    if (!(uploaded instanceof File)) {
      return json({ error: 'An APK file is required' }, { status: 400 });
    }

    if (!uploaded.name.toLowerCase().endsWith('.apk')) {
      return json({ error: 'Only .apk files are accepted' }, { status: 400 });
    }

    if (uploaded.size > MAX_ARCHIVE_BYTES) {
      return json({ error: `APK exceeds the ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB upload limit` }, { status: 413 });
    }

    const archive = await JSZip.loadAsync(await uploaded.arrayBuffer(), { checkCRC32: false });
    const entries = Object.values(archive.files).filter((entry) => !entry.dir);

    if (entries.length > MAX_FILES) {
      return json({ error: `APK contains too many files (maximum ${MAX_FILES})` }, { status: 413 });
    }

    const files: ExtractedFile[] = [];
    const dexIndexes: ReturnType<typeof dexIndex>[] = [];
    let totalSize = 0;
    let manifestText = '';

    for (const entry of entries) {
      const path = safePath(entry.name);
      const bytes = new Uint8Array(await entry.async('arraybuffer'));

      if (bytes.byteLength > MAX_ENTRY_BYTES || totalSize + bytes.byteLength > MAX_UNCOMPRESSED_BYTES) {
        return json({ error: 'APK exceeds the safe uncompressed size limit' }, { status: 413 });
      }

      totalSize += bytes.byteLength;
      files.push({ path, content: encodeBase64(bytes), encoding: 'base64', size: bytes.byteLength });

      if (path === 'AndroidManifest.xml') {
        manifestText = manifestAsReadableXml(bytes);
      }

      if (/^classes\d*\.dex$/.test(path)) {
        dexIndexes.push(dexIndex(bytes, path));
      }
    }

    if (!manifestText) {
      return json({ error: 'This archive is missing AndroidManifest.xml' }, { status: 400 });
    }

    return json({
      success: true,
      fileName: uploaded.name,
      files,
      manifestText,
      dexIndex: dexIndexes,
      limits: { maxFiles: MAX_FILES, maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not extract APK' }, { status: 400 });
  }
}