// IntMed same-domain gateway for networks that cannot reach *.supabase.co.
// No secret is stored here. The browser's public anon key and user JWT are
// forwarded only to this project's fixed Supabase origin.
const UPSTREAM = 'https://upwbktvnybsjugdegjji.supabase.co';
const ALLOWED_ORIGINS = new Set([
  'https://drgerami-md.ir',
  'https://www.drgerami-md.ir',
]);
const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/', '/functions/v1/'];
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://drgerami-md.ir',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'apikey,authorization,content-type,prefer,accept,x-client-info',
    'Access-Control-Expose-Headers': 'content-range,range-unit',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ message: 'Origin not allowed' }), {
        status: 403,
        headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: cors(origin) });
    }
    if (!ALLOWED_PREFIXES.some((prefix) => incoming.pathname.startsWith(prefix))) {
      return new Response('Not found', { status: 404, headers: cors(origin) });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 2_000_000) {
      return new Response('Request too large', { status: 413, headers: cors(origin) });
    }

    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const responseHeaders = new Headers(upstream.headers);
    Object.entries(cors(origin)).forEach(([key, value]) => responseHeaders.set(key, value));
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.delete('Set-Cookie');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
