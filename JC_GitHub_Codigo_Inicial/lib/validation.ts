import { z } from 'zod';
export const CheckoutSchema = z.object({
  client_key: z.uuid(),
  buyer: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.email().max(254),
    phone: z.string().trim().min(6).max(50),
    address: z.string().trim().min(5).max(240),
    notes: z.string().max(500).optional().default(''),
  }),
  lines: z.array(z.object({offer_id: z.uuid(), qty: z.number().int().min(1).max(100)})).min(1).max(60)
}).refine(v => new Set(v.lines.map(l => l.offer_id)).size === v.lines.length, {message: 'No se permiten líneas repetidas'});
