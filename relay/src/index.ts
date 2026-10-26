import { Family } from './family';

export { Family };

export interface Env {
  FAMILY: DurableObjectNamespace<Family>;
}

const FAMILY_PATH = /^\/v1\/families\/([A-Za-z0-9_-]{16,64})(\/.*)?$/;

/**
 * Routes each family's requests to its own Durable Object. The relay only ever sees
 * device public keys, timestamps and ciphertext; it cannot read what parents log.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true });
    const match = FAMILY_PATH.exec(url.pathname);
    if (!match) return Response.json({ error: 'not_found' }, { status: 404 });
    const stub = env.FAMILY.get(env.FAMILY.idFromName(match[1]));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
