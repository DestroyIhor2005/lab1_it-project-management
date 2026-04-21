const POSTHOG_UPSTREAM_HOST = String(
  process.env.VITE_PUBLIC_POSTHOG_API_HOST ||
  process.env.VITE_PUBLIC_POSTHOG_HOST ||
  process.env.POSTHOG_API_HOST ||
  'https://eu.i.posthog.com'
).trim().replace(/\/+$/, '');

const readRawBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];

  request.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  request.on('end', () => {
    resolve(Buffer.concat(chunks));
  });

  request.on('error', reject);
});

const forwardHeaders = (incomingHeaders) => Object.entries(incomingHeaders).reduce((headers, [key, value]) => {
  if (key === 'host' || key === 'content-length') {
    return headers;
  }

  if (Array.isArray(value)) {
    headers[key] = value.join(', ');
    return headers;
  }

  if (value !== undefined) {
    headers[key] = String(value);
  }

  return headers;
}, {});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request, response) {
  const rawPath = String(request.query.path || '').trim();
  const upstreamUrl = new URL(POSTHOG_UPSTREAM_HOST);
  const forwardedFor = String(request.headers['x-forwarded-for'] || '').trim();
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '';

  upstreamUrl.pathname = rawPath ? `/${rawPath.replace(/^\/+/, '')}` : '/';

  for (const [key, value] of Object.entries(request.query)) {
    if (key === 'path') {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => upstreamUrl.searchParams.append(key, String(item)));
    } else if (value !== undefined) {
      upstreamUrl.searchParams.set(key, String(value));
    }
  }

  try {
    const method = String(request.method || 'GET').toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);
    const body = hasBody ? await readRawBody(request) : null;
    const headers = forwardHeaders(request.headers);

    if (clientIp) {
      headers['x-forwarded-for'] = clientIp;
      headers['x-real-ip'] = clientIp;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body: body && body.length ? body : undefined,
      redirect: 'manual',
    });

    response.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey === 'content-length' ||
        normalizedKey === 'content-encoding' ||
        normalizedKey === 'transfer-encoding' ||
        normalizedKey === 'connection'
      ) {
        return;
      }

      response.setHeader(key, value);
    });

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    response.send(responseBody);
  } catch {
    response.status(502).json({
      error: 'Upstream PostHog request failed',
    });
  }
}