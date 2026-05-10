/**
 * Builds client-side API URLs.
 * In web mode it keeps relative URLs.
 * In Cordova mode, NEXT_PUBLIC_API_BASE_URL points to a deployed backend.
 */
export function toApiUrl(pathname: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  if (!baseUrl) {
    return pathname;
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
}
