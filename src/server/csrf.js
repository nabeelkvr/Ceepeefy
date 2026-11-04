/**
 * CSRF & Request Origin Validation Helper
 * Protects state-changing endpoints (POST, PUT, PATCH, DELETE) against cross-origin attacks.
 * Permits legitimate same-origin requests, Vercel Preview deployments (*.vercel.app),
 * localhost during development, and configured production domains.
 */
export function validateRequestOrigin(request) {
  const method = request.method?.toUpperCase();

  // Read-only / safe HTTP methods are exempt
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  // If neither Origin nor Referer is present:
  if (!originHeader && !refererHeader) {
    // Permit in test runner or headless SSR where browser origin headers are not injected
    if (process.env.NODE_ENV === "test") {
      return { valid: true };
    }
    return {
      valid: false,
      error: "Forbidden: State-changing requests must include an Origin or Referer header.",
    };
  }

  const targetHeader = originHeader || refererHeader;
  let parsedUrl;
  try {
    parsedUrl = new URL(targetHeader);
  } catch {
    return { valid: false, error: "Forbidden: Malformed Origin or Referer header." };
  }

  const incomingOrigin = parsedUrl.origin.toLowerCase();
  const incomingHostname = parsedUrl.hostname.toLowerCase();
  const incomingProtocol = parsedUrl.protocol.toLowerCase();

  // 1. Same-Origin Check: Matches current request URL origin
  if (request.nextUrl && incomingOrigin === request.nextUrl.origin.toLowerCase()) {
    return { valid: true };
  }

  // Also check Host header match
  const hostHeader = request.headers.get("host")?.toLowerCase();
  if (hostHeader) {
    const [expectedHost, expectedPort] = hostHeader.split(":");
    const actualPort = parsedUrl.port || (incomingProtocol === "https:" ? "443" : "80");
    const reqPort = expectedPort || (incomingProtocol === "https:" ? "443" : "80");

    if (incomingHostname === expectedHost && actualPort === reqPort) {
      return { valid: true };
    }
  }

  // 2. Development localhost / 127.0.0.1
  if (
    (incomingHostname === "localhost" || incomingHostname === "127.0.0.1") &&
    (incomingProtocol === "http:" || incomingProtocol === "https:")
  ) {
    return { valid: true };
  }

  // 3. Vercel Preview and Production deployments (*.vercel.app)
  if (
    incomingProtocol === "https:" &&
    (incomingHostname === "vercel.app" || incomingHostname.endsWith(".vercel.app"))
  ) {
    return { valid: true };
  }

  // 4. Configured App URL
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredAppUrl) {
    try {
      const parsedConfig = new URL(configuredAppUrl);
      if (incomingOrigin === parsedConfig.origin.toLowerCase()) {
        return { valid: true };
      }
    } catch {}
  }

  return {
    valid: false,
    error: `Forbidden: Request origin '${incomingOrigin}' is not authorized.`,
  };
}

