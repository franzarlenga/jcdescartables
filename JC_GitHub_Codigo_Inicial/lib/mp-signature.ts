import { createHmac, timingSafeEqual } from 'node:crypto';

/** Mercado Pago: id:[data.id_url];request-id:[x-request-id];ts:[ts]; */
export function validateMpSignature(signature: string | null, requestId: string | null, dataId: string | null, secret: string | undefined) {
  if (!signature || !requestId || !dataId || !secret) return false;
  const params = Object.fromEntries(signature.split(',').map(part => part.split('=').map(s => s.trim())));
  if (!params.ts || !/^[0-9]+$/.test(params.ts) || !/^[a-f0-9]{64}$/i.test(params.v1 ?? '')) return false;
  const epoch = Number(params.ts);
  if (!Number.isFinite(epoch) || Math.abs(Date.now() - epoch) > 10 * 60 * 1000) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${params.ts};`;
  const computed = createHmac('sha256', secret).update(manifest).digest();
  const supplied = Buffer.from(params.v1, 'hex');
  return supplied.length === computed.length && timingSafeEqual(computed, supplied);
}
