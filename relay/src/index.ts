import { Family } from './family';
import type { ApnsEnv } from './apns';
import type { FcmEnv } from './fcm';

export { Family };

export interface Env extends FcmEnv, ApnsEnv {
  FAMILY: DurableObjectNamespace<Family>;
}

const FAMILY_PATH = /^\/v1\/families\/([A-Za-z0-9_-]{16,64})(\/.*)?$/;

/**
 * App versions before 0.11.2 re-registered for pushes in a loop (dozens a second). The same
 * registration from the same phone within this window is turned away here, before it costs
 * a Durable Object request. Per isolate, so best effort; a changed registration goes through.
 */
const REGISTER_WINDOW_MS = 3_000;
const lastRegister = new Map<string, { at: number; body: string }>();

async function repeatedRegistration(request: Request, sub: string | undefined, now: number) {
  if (request.method !== 'PUT' || sub !== '/device') return false;
  const device = request.headers.get('x-bt-device');
  if (!device) return false;
  let body: string;
  try {
    // The label is sealed afresh each time; the rest repeats exactly.
    const parsed = (await request.clone().json()) as Record<string, unknown>;
    delete parsed.label;
    body = JSON.stringify(parsed);
  } catch {
    return false;
  }
  const last = lastRegister.get(device);
  if (last && last.body === body && now - last.at < REGISTER_WINDOW_MS) return true;
  if (lastRegister.size > 10_000) lastRegister.clear();
  lastRegister.set(device, { at: now, body });
  return false;
}

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
    if (await repeatedRegistration(request, match[2], Date.now())) {
      return Response.json({ error: 'too_many_requests' }, { status: 429 });
    }
    const stub = env.FAMILY.get(env.FAMILY.idFromName(match[1]));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
