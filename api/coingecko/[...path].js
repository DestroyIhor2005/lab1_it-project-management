const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

export default async function handler(request, response) {
  const pathSegments = Array.isArray(request.query.path)
    ? request.query.path
    : [request.query.path].filter(Boolean);

  const upstreamUrl = new URL(`${COINGECKO_BASE_URL}/${pathSegments.join('/')}`);

  // Preserve all query params except Vercel's internal dynamic route param.
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

  const headers = {
    accept: 'application/json',
  };

  // Keep the CoinGecko key on the server side only.
  const apiKey = String(process.env.COINGECKO_API_KEY || '').trim();
  if (apiKey) {
    // Demo plan auth format.
    headers['x-cg-demo-api-key'] = apiKey;
    if (!upstreamUrl.searchParams.has('x_cg_demo_api_key')) {
      upstreamUrl.searchParams.set('x_cg_demo_api_key', apiKey);
    }
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
    });

    const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
    const bodyText = await upstreamResponse.text();

    response.setHeader('content-type', contentType);
    response.status(upstreamResponse.status).send(bodyText);
  } catch {
    response.status(502).json({
      error: 'Upstream CoinGecko request failed',
    });
  }
}
