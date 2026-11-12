/** Headers for a Cloudflare Access service token. Empty when the entrance is not in front. */
export function accessHeaders(id?: string, secret?: string): Record<string, string> {
  const clientId = id?.trim() ?? "";
  const clientSecret = secret?.trim() ?? "";
  if (!clientId || !clientSecret) return {};
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };
}
