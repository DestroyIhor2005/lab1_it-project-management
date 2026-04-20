const buildSentryEnvelopeUrl = (dsn) => {
  const normalizedDsn = String(dsn || '').trim();

  if (!normalizedDsn) {
    return null;
  }

  try {
    const parsedDsn = new URL(normalizedDsn);
    const projectId = parsedDsn.pathname.replace(/^\/+/, '').split('/')[0];

    if (!projectId) {
      return null;
    }

    return `https://${parsedDsn.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
};

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
  const upstreamUrl = buildSentryEnvelopeUrl(
    process.env.VITE_SENTRY_DSN || process.env.SENTRY_DSN
  );

  if (!upstreamUrl) {
    response.status(500).json({
      error: 'Sentry DSN is not configured',
    });
    return;
  }

  try {
    const method = String(request.method || 'POST').toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);
    const body = hasBody ? await readRawBody(request) : null;

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders(request.headers),
      body: body && body.length ? body : undefined,
      redirect: 'manual',
    });

    response.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'content-length' || normalizedKey === 'transfer-encoding' || normalizedKey === 'connection') {
        return;
      }

      response.setHeader(key, value);
    });

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    response.send(responseBody);
  } catch {
    response.status(502).json({
      error: 'Upstream Sentry request failed',
    });
  }
}