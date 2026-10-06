import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { extractApkWithTools, type ApkExtractionStage } from '~/lib/services/apkExtraction';

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (message: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        };

        const onProgress = (stage: ApkExtractionStage) => {
          send({ type: 'progress', stage });
        };

        void extractApkWithTools(uploaded, onProgress)
          .then((result) => {
            send({ type: 'result', payload: result });
            controller.close();
          })
          .catch((error) => {
            send({
              type: 'error',
              error: error instanceof Error ? error.message : 'Could not extract APK',
            });
            controller.close();
          });
      },
    });

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not extract APK' }, { status: 400 });
  }
}
