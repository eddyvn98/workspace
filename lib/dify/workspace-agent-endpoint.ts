const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export function resolveWorkspaceAgentEndpoint(options: {
  configuredUrl?: string;
  productionFallbackUrl: string;
  isProduction: boolean;
}): string | null {
  const configuredUrl = options.configuredUrl?.trim();
  if (options.isProduction) return configuredUrl || options.productionFallbackUrl;
  if (!configuredUrl) return null;

  try {
    const hostname = new URL(configuredUrl).hostname.toLowerCase();
    return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost") ? configuredUrl : null;
  } catch {
    return null;
  }
}
