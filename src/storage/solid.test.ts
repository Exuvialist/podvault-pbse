import { describe, expect, it } from 'vitest';
import { StorageError } from './adapter.js';
import { SolidAdapter } from './solid.js';

interface Call {
  url: string;
  init: RequestInit;
}

function adapterWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>, token?: string) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as typeof fetch;
  const adapter = new SolidAdapter({
    baseUrl: 'https://pod.test/',
    webId: 'https://pod.test/profile#me',
    ...(token ? { token } : {}),
    fetchImpl,
  });
  return { adapter, calls };
}

describe('SolidAdapter', () => {
  it('joins paths onto the base URL and sends auth headers', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"a":1}', { status: 200 }), 'tok-123');
    const text = await adapter.readText('/vault/config.json');
    expect(text).toBe('{"a":1}');
    expect(calls[0]?.url).toBe('https://pod.test/vault/config.json');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect((calls[0]?.init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('works without a trailing slash on the base URL', async () => {
    const calls: string[] = [];
    const adapter = new SolidAdapter({
      baseUrl: 'https://pod.test',
      webId: 'x',
      fetchImpl: (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response('ok', { status: 200 });
      }) as typeof fetch,
    });
    await adapter.readText('vault/config.json');
    expect(calls[0]).toBe('https://pod.test/vault/config.json');
  });

  it('returns null for a missing resource', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.readText('/vault/config.json')).toBeNull();
  });

  it('maps 401 to an auth StorageError', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 401 }));
    await expect(adapter.readText('/vault/config.json')).rejects.toMatchObject({ code: 'auth', status: 401 });
  });

  it('maps network failures to a network StorageError', async () => {
    const { adapter } = adapterWith(() => {
      throw new TypeError('fetch failed');
    });
    await expect(adapter.readText('/vault/config.json')).rejects.toBeInstanceOf(StorageError);
    await expect(adapter.readText('/vault/config.json')).rejects.toMatchObject({ code: 'network' });
  });

  it('PUTs JSON with the right content type', async () => {
    const { adapter, calls } = adapterWith(() => new Response(null, { status: 201 }));
    await adapter.writeText('/vault/files/a.json', '{"x":1}');
    expect(calls[0]?.init.method).toBe('PUT');
    expect((calls[0]?.init.headers as Record<string, string>)['Content-Type']).toContain('application/json');
    expect(calls[0]?.init.body).toBe('{"x":1}');
  });

  it('treats DELETE of a missing resource as success', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    await expect(adapter.remove('/vault/files/gone.json')).resolves.toBeUndefined();
  });

  it('parses container Turtle into child paths', async () => {
    const turtle = `
      @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <https://pod.test/vault/files/> a ldp:Container ;
        ldp:contains <https://pod.test/vault/files/a.json>, <https://pod.test/vault/files/b.json> .
    `;
    const { adapter, calls } = adapterWith(() => new Response(turtle, { status: 200 }));
    const paths = await adapter.list('/vault/files/');
    expect(paths).toEqual(['/vault/files/a.json', '/vault/files/b.json']);
    expect(calls[0]?.url).toBe('https://pod.test/vault/files/');
    expect((calls[0]?.init.headers as Record<string, string>).Accept).toBe('text/turtle');
  });

  it('returns an empty list for a missing container', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.list('/vault/shares/')).toEqual([]);
  });
});
