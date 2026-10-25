function publicOrigins() {
  const values = process.env.JEV_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const allowed = new Set();
  for (const value of values) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) throw new Error('Invalid configured origin.');
    allowed.add(value);
  }
  return allowed;
}

export function isSameOrigin(request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
    const origin = request.headers.get('origin');
    const target = new URL(request.url);
    const host = request.headers.get('host');
    const allowed = publicOrigins();
    if (origin && allowed.size && !allowed.has(origin)) return false;

    // Keep the exact local authority even though NextURL normalizes 127.0.0.1.
    let directHost = !host || host === target.host;
    if (!directHost) {
      const port = target.port ? `:${target.port}` : '';
      const localHosts = [`localhost${port}`, `127.0.0.1${port}`];
      if (localHosts.includes(target.host) && localHosts.includes(host)) {
        target.host = host;
        directHost = true;
      }
    }
    if (directHost && (!origin || origin === target.origin)) return true;

    // Proxy headers alone cannot authorize an origin. The operator must opt in
    // and explicitly allow the public origin, behind a proxy that overwrites them.
    if (!origin || process.env.JEV_TRUST_PROXY_HEADERS !== 'true' || !allowed.has(origin)) return false;
    const source = new URL(origin);
    const forwardedHost = request.headers.get('x-forwarded-host') ?? host;
    const forwardedProto = request.headers.get('x-forwarded-proto');
    return source.origin === origin && forwardedHost === source.host && `${forwardedProto}:` === source.protocol;
  } catch {
    return false;
  }
}
