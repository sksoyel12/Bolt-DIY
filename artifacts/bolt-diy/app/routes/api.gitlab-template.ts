import { json } from '@remix-run/cloudflare';
import JSZip from 'jszip';
import { parseCookies } from '~/lib/api/cookies';

function getGitLabToken(cookieHeader: string | null, hostname: string) {
  const cookies = parseCookies(cookieHeader);
  const credentialCookie = cookies[`git:${hostname}`] || cookies['git:gitlab.com'];

  if (!credentialCookie) {
    return undefined;
  }

  try {
    const credentials = JSON.parse(credentialCookie) as { password?: string; username?: string };
    return credentials.password || credentials.username;
  } catch {
    return undefined;
  }
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');
  const baseUrl = url.searchParams.get('baseUrl') || 'https://gitlab.com';
  const branch = url.searchParams.get('branch') || undefined;

  if (!repo) {
    return json({ error: 'GitLab repository name is required' }, { status: 400 });
  }

  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);

    if (parsedBaseUrl.protocol !== 'https:' || parsedBaseUrl.pathname !== '/') {
      throw new Error('Invalid GitLab URL');
    }
  } catch {
    return json({ error: 'Invalid GitLab URL' }, { status: 400 });
  }

  try {
    const token =
      getGitLabToken(request.headers.get('Cookie'), parsedBaseUrl.hostname) ||
      process.env.GITLAB_TOKEN ||
      process.env.VITE_GITLAB_ACCESS_TOKEN;
    const projectId = encodeURIComponent(repo);
    const archiveUrl = new URL(`${parsedBaseUrl.origin}/api/v4/projects/${projectId}/repository/archive.zip`);

    if (branch) {
      archiveUrl.searchParams.set('sha', branch);
    }

    const response = await fetch(archiveUrl, {
      headers: {
        Accept: 'application/zip',
        ...(token ? { 'PRIVATE-TOKEN': token } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab archive request failed: ${response.status}`);
    }

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    let rootFolderName = '';

    zip.forEach((relativePath) => {
      if (!rootFolderName && relativePath.includes('/')) {
        rootFolderName = relativePath.split('/')[0];
      }
    });

    const files = await Promise.all(
      Object.entries(zip.files).map(async ([filename, zipEntry]) => {
        if (zipEntry.dir) {
          return null;
        }

        const path =
          rootFolderName && filename.startsWith(`${rootFolderName}/`)
            ? filename.slice(rootFolderName.length + 1)
            : filename;

        return {
          name: path.split('/').pop() || '',
          path,
          content: await zipEntry.async('string'),
        };
      }),
    );

    return json(files.filter(Boolean));
  } catch (error) {
    console.error('Error processing GitLab repository:', error);

    return json(
      {
        error: 'Failed to fetch GitLab repository files',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
