# JC Gestión + Tienda Online — Etapa 1

**Estado:** proyecto de aplicación real preparado para conectar a Supabase y Vercel, NO desplegado ni autorizado para cobrar. No es una modificación de la V12 offline; es el núcleo web compartido sobre el que migraremos el ERP.

## Alcance implementado

- **Tienda pública responsive**: catálogo por familias / marcas; variantes por medida/modelo; presentación cerrada o individual; `− / +`; carrito; compra sin registrarse.
- **Mercado Pago Checkout Pro**: creación de preferencia en servidor desde importes oficiales de la BD, redirección al checkout y webhooks con verificación de firma; máximo de cuotas solicitado: 12, sujeto al medio de pago y a la cuenta JC.
- **ERP JC /admin**: acceso privado por Supabase Auth, búsqueda entre 337 SKU, carga de conteos físicos, precios individuales y por bulto, foto del SKU (cámara en el celular o archivo), habilitación de grupos, pedidos y cobros web, entregas parciales.
- **PostgreSQL**: 337 artículos y sus costos/prestaciones originales importados, con **JC como marca operativa** en los 134 casos sin fabricante. Proveedores no se confunden con marcas. Seis grupos piloto *sin publicar*: Rolan Rendidor original (10 variantes) y 5 grupos Elegante (12 SKU en total).
- **Stock único**: unidad y bulto apuntan al mismo saldo en UMS; la reserva del pedido no descuenta stock físico; la entrega sí, con movimiento auditable e idempotencia.
- **Finanzas**: un cobro verificado por Mercado Pago crea movimiento ING vinculado a PED; no se considera pagado por visitar la URL de éxito.

## Qué NO está hecho todavía

- No se creó un proyecto Supabase ni Vercel, porque no hay cuentas conectadas ni credenciales.
- No están cargados **precios de venta, stock real ni fotos**, por decisión previa. La tienda comienza sin publicaciones visibles; los costos internos nunca se muestran públicamente.
- No se importaron pedidos/clientes/caja de V12: V12 sigue siendo una demo local de `localStorage`. Este módulo de ventas online es el inicio del nuevo ERP compartido, no su migración total.
- No está habilitada la integración con publicaciones de Mercado Libre, logística con cotización de envíos, facturación fiscal, devolución de pagos ni cupones.
- No se incluyen política de privacidad, términos de compra, facturación, operador de entregas, tasa logística ni validación de merchant. Requieren definición y pruebas antes de vender.
- Antes de operar con compradores reales: agregar protección anti-abuso/rate-limit de checkout, pruebas de pagos aprobados, pendientes, rechazados y diferidos, conciliación de pagos tardíos, monitoreo, backup, y verificación legal/comercial.

## Puesta en marcha en PC (desarrollo)

1. Crear proyecto **JC** en Supabase Free, separado del de FIERRO.
2. Abrir SQL Editor en Supabase y ejecutar, en orden:
   - `supabase/migrations/001_jc_store.sql`
   - `supabase/migrations/002_seed_catalog.sql`
3. Ir a Supabase > Authentication > Users. Crear una cuenta administradora con contraseña fuerte. Anotar su UUID y ejecutar en SQL Editor:
   ```sql
   insert into public.jc_admin_users(user_id) values ('UUID_DEL_USUARIO') on conflict do nothing;
   ```
4. Copiar `.env.example` a `.env.local` y completar las claves. **Nunca subir `.env.local` al repositorio ni compartir la clave service_role en el chat.**
5. En la carpeta del proyecto: `npm install` y `npm run dev` (se requiere conexión a npm).
6. Abrir `http://localhost:3000/admin`, iniciar sesión; registrar stock real, foto y precio de venta; habilitar al menos una oferta y su grupo.
7. Visitar `http://localhost:3000` para comprobar cómo queda la tienda pública.
8. Mantener `CHECKOUT_ENABLED=false` hasta configurar Mercado Pago, URL pública, webhook, firma y validar el circuito completo en pruebas.

## Mercado Pago

- Utiliza **Checkout Pro / Preferences API**, documentado en https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/overview
- Crear credenciales **de prueba** desde la cuenta comercial JC; guardar token solo en el servidor (`MP_ACCESS_TOKEN`).
- Configurar webhook de tipo `payment` hacia `https://TU_DOMINIO/api/mp-webhook`, copiar el secreto de firma (`MP_WEBHOOK_SECRET`).
- La firma HMAC se verifica antes de consultar el pago real por API. Comprobar también `external_reference`, monto, moneda y ambiente.
- `MP_TEST_MODE=true`: usa `sandbox_init_point` cuando está disponible. Para producción, `MP_TEST_MODE=false` y credenciales reales.
- `CHECKOUT_ENABLED=true`: habilita la creación de preferencias **solo tras la validación integral y el cambio a Vercel Pro**.
- **Las cuotas son opciones determinadas por Mercado Pago.** `installments:12` configura un máximo solicitado, no promete 12 cuotas ni cuotas sin interés.
- **Entregas**: la etapa actual informa “a coordinar”, sin costo de envío sumado al precio; NO operar comercialmente hasta resolver condiciones de entrega.

## Arquitectura y seguridad

- Next.js App Router + TypeScript + Supabase PostgreSQL/Auth/Storage + Mercado Pago (servidor).
- Las claves privadas `SUPABASE_SERVICE_ROLE_KEY` y `MP_ACCESS_TOKEN` se usan exclusivamente en rutas servidor; no deben empezar con `NEXT_PUBLIC_`.
- RLS activado en todas las tablas privadas. Vista `public_storefront` limitada a artículos publicados con precio y stock, sin costos ni datos de compradores.
- Solo administradores incluidos en `jc_admin_users` pueden editar catálogo, precios, stock, fotos y marcar entregas.
- Funciones de pedido y confirmación de cobros solo ejecutables con `service_role` por el backend.
- Reserva física garantizada por transacción de base de datos y bloqueo de balances de cada SKU; los reintentos usan `checkout_key` y cobros están protegidos por ID de pago único.
- Reserva de 45 minutos. El endpoint protegido `GET /api/cron/expire` ejecuta la expiración; debe programarse desde cron permitido por el hosting (no se activa automáticamente en Hobby). Pago aprobado tardíamente luego del vencimiento => **payment_review**, nunca entrega automática sin validación.
- `jc_deliver_line` registra entregas completas o parciales, con operación idempotente y ajuste de stock solo de unidades entregadas.

## Restricción Vercel Hobby

Vercel Hobby permite **pruebas no comerciales**. No operar una tienda real ni recibir pedidos comerciales en Hobby. Antes de uso comercial, pasar a Vercel Pro y completar las verificaciones anteriores.

## Fuentes del catálogo

- `data/ATLAS_Catalogo_Importacion.csv` generado previamente desde `Lista_Costos_JC.pdf` (vigencia 15/11/2026).
- `scripts/generate_seed.py` transforma referencias `SMD` a la marca operativa `JC` aprobada por el usuario y crea un SQL idempotente.
- Si recibimos una nueva lista de costos, **no ejecutar el seed inicial para alterar históricos**: registrar una nueva vigencia de costos y migración separada.

## Próxima etapa priorizada

1. Conectar Supabase, Vercel y repositorio (GitHub) y ejecutar migraciones.
2. Probar admin y tienda con 3 SKU Rolan y precio/stock cargados manualmente como pruebas, sin cobros reales.
3. Integrar la lógica y datos de Pedidos, Inventario, Caja y tareas del ERP V12 en la **misma** base PostgreSQL, sin duplicaciones.
4. Completar fotos y precios desde celular y luego preparar publicaciones de Mercado Libre por grupos de variantes.
5. Certificar circuito de cobros, inventario, devoluciones y entregas antes de pasar a Vercel Pro y producción.
