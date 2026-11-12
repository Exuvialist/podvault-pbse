/**
 * Best-effort client IP for the forensic watermark.
 * Off by default: calling a third-party service leaks the user's IP, which contradicts
 * the product's privacy promise. When enabled, the result is cached per tab session.
 */
let cached: string | null = null;

export async function getClientIp(enabled: boolean): Promise<string> {
  if (!enabled) return 'ip-lokal';
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: ctrl.signal,
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`status-${res.status}`);
    const data = (await res.json()) as { ip?: string };
    cached = data.ip ?? 'ip-tidak-diketahui';
  } catch {
    cached = 'ip-tidak-diketahui';
  } finally {
    clearTimeout(timer);
  }
  return cached;
}
