-- 006 / Registro complementario y privado de cobros Mercado Pago.
-- No activa checkout ni modifica pagos históricos. Idempotente.
-- El dato net_received_cents puede ser NULL cuando Mercado Pago no lo informe.
alter table public.jc_mp_payments
  add column if not exists net_received_cents bigint check (net_received_cents is null or net_received_cents >= 0),
  add column if not exists payment_method_id text,
  add column if not exists payment_type_id text,
  add column if not exists installments integer check (installments is null or installments >= 1),
  add column if not exists fee_details jsonb;
-- Para comisiones exactas y saldo efectivamente acreditado, reconciliar reportes MP.
-- La información comercial visible queda en el frontend: no se coloca ningún token en SQL.
