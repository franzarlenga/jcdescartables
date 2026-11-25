# JC Descartables · Tienda V3 + JC Gestión integrado

**Actualización operativa de JC Gestión (25/11/2026)**. Se incorpora el ERP privado **dentro del mismo proyecto Next.js** que ya usa Vercel, GitHub y Supabase. La home pública V3 y el catálogo no fueron rediseñados ni sustituidos.

## Acceso

- **Tienda pública:** `https://jcdescartables.ar/` (o la URL de Vercel mientras se propaga DNS).
- **ERP privado:** `https://gestion.jcdescartables.ar/` (cuando ese subdominio esté agregado al MISMO proyecto de Vercel), o `https://jcdescartables.vercel.app/gestion` para pruebas.
- **Costos y precios:** `/gestion/precios` (módulo ya implementado, con edición manual, porcentual y cálculo desde costo).
- Los clientes pueden visitar la tienda. **Las rutas privadas exigen Supabase Auth y el usuario debe figurar en `public.jc_admin_users`**. La seguridad real está en las políticas RLS y funciones SQL, no en que el subdominio sea difícil de adivinar.

## Qué se incorporó en esta actualización

- Dashboard privado con saldo de caja registrado, pedidos activos, tareas vencidas e inventario mínimo.
- Inventario real por SKU, familia y marca; físico, reservado y disponible; conteo físico, alerta de mínimo y fotografía desde celular.
- Pedidos directos manuales con reserva atómica y stock descontado **únicamente al registrar la entrega** después de verificar el cobro.
- Ventas manuales de Mercado Libre: referencia única de operación, precio real de venta, comisión, envío y otros cargos; **resta del físico al confirmar**. Diferencia entre neto esperado y dinero efectivamente acreditado. Reversión auditable de una venta ML sin cobros.
- Cobros parciales/verificados y gastos por concepto. Caja de operaciones registradas; **pagos MP aprobados se muestran aparte, sin asumir que están acreditados netos en la cuenta**.
- Tareas con tablero de tres etapas (arrastrar en escritorio, opciones de un toque en celular), fechas y agenda; completar una tarea no mueve stock ni registra cobros.
- Tienda Online administrada desde el ERP: publicación y categorías de grupos, activación por presentación, edición de los textos principales de la home; costos y precios independientes, enlazados por producto/SKU.
- En móvil: navegación fija Inicio / Finanzas / + / Stock / Más, controles de cantidades `−/número/+`, sin desplazamiento horizontal de la página.

## Instalación sobre el repositorio EXISTENTE `franzarlenga/jcdescartables`

La carpeta real configurada en Vercel es **`JC_GitHub_Codigo_Inicial`**. **No crear otro repositorio ni cambiar Root Directory.** Reemplazar/añadir en esa carpeta los archivos de este proyecto. La raíz de la app sigue conteniendo `package.json`, `app/`, `components/`, `lib/` y `supabase/`.

### 1. SQL en Supabase (UNA vez, en orden)

Ya estaban preparadas/evaluadas las migraciones **001, 002 y 003**. No repetirlas innecesariamente. Si aún no corriste las siguientes, ejecutar en `Supabase → SQL Editor`:

1. `supabase/migrations/004_home_content.sql`
2. `supabase/migrations/005_sku_legibles.sql`
3. `supabase/migrations/006_mp_reconciliation_and_jc_contact.sql`
4. `supabase/migrations/007_costos_y_precios.sql`
5. **`supabase/migrations/009_erp_operativo.sql`** — NUEVA, no necesita la migración `008` de CRM (el CRM ampliado quedó fuera del alcance por decisión expresa).

`009` crea operaciones, finanzas, ventas ML, tareas, costos históricos de renglones, validaciones de reserva y reversión. No publica nada, no crea existencias y no inventa precios.

### 2. Dar de alta al primer usuario privado

En Supabase → **Authentication → Users**, crear o invitar a la persona que manejará JC. **No poner contraseñas en el repositorio**. Copiar el UUID de ese usuario y ejecutar en SQL Editor:

```sql
insert into public.jc_admin_users(user_id)
values ('REEMPLAZAR_CON_UUID_REAL') on conflict(user_id) do nothing;
```

Es un UUID de Supabase Auth, no un email. El panel solo acepta cuentas autorizadas.

### 3. Vercel

- Conservar **Framework: Next.js** y **Root Directory: `JC_GitHub_Codigo_Inicial`**.
- Tener `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel (son públicas, no confundir con `SUPABASE_SERVICE_ROLE_KEY`).
- Mantener **`CHECKOUT_ENABLED=false`** hasta completar pruebas con la cuenta Mercado Pago del dueño.
- Hacer commit al mismo repositorio. Vercel construirá y desplegará automáticamente el nuevo código.
- Para usar el subdominio privado, agregar **`gestion.jcdescartables.ar` como dominio del mismo proyecto Vercel**; `middleware.ts` reescribe la raíz de ese host a `/gestion`. Requiere que DNS esté propagado.

### 4. Prueba inicial segura

1. Entrar a `/gestion` e iniciar sesión.
2. Elegir un SKU conocido, contar su stock físico real y cargar una foto.
3. Ir a `/gestion/precios`, cargar un precio de bulto y otro individual; no se cambia automáticamente el costo histórico.
4. En Gestión → Tienda Online, habilitar las ofertas y el grupo comercial correspondiente.
5. Revisar la tienda: solo aparece con **precio, oferta habilitada, grupo publicado y stock disponible**.
6. Registrar **una venta ML de prueba con referencia ÚNICA**, comisión y envío; comprobar descuento físico y resultado comercial (no se acredita automáticamente Caja).
7. Registrar un pedido directo con otra referencia: debe reservar stock, no descontarlo físicamente. Verificar un cobro y después registrar entrega; recién ahí reduce el físico.
8. Probar una cancelación pendiente y verificar liberación de reserva; registrar un gasto y comprobar Finanzas.

### Estado de validación y límites antes de lanzar ventas reales

- **22 pruebas Node locales superadas** sobre estructura, identidad de los 337 SKU, las 82 agrupaciones, la home pública y los contratos del nuevo ERP. TSX y middleware **analizados sintácticamente sin errores**.
- **No se ejecutó una compilación Next.js completa en este entorno**: el acceso a `registry.npmjs.org` falló. La compilación real debe comprobarse con los logs de Vercel después del commit.
- **No se ejecutó la migración 009 ni operaciones transaccionales contra la base real de JC** desde este entorno. Requieren validación en Supabase y pruebas de dos operaciones concurrentes antes de operar públicamente.
- El **checkout continúa desactivado**, sin credenciales Mercado Pago reales ni pagos habilitados. Probar webhooks, expiración automática de reservas (endpoint `/api/cron/expire` con `CRON_SECRET`), reversión de cobros, reembolsos y conciliación bancaria antes de activarlo.
- La agenda actual se basa en fechas de tareas; aún falta enlazar las entregas programadas con día/semana/mes y usuarios repartidores. La vista Kanban permite cambios de etapa con controles y drag & drop.
- El CRM avanzado y la API de Mercado Libre **no están incluidos**, conforme a las decisiones del proyecto.
- Para uso comercial pasar Vercel Hobby → Pro; para Supabase Free configurar respaldos externos. Validar privacidad, comprobantes, logística, facturación y condiciones legales.

### Integridad de stock

- `jc_products` es la fuente única de identidad y costo; `jc_offers` guarda precios de **bulto** e **individual**; `jc_stock` guarda cantidad física en unidad base, `jc_reservations` compromisos. No generar segundo inventario para la tienda.
- La venta de Mercado Libre se registra **solo manualmente**. Su referencia debe ser única, con cargo, envío y otros importes. Esto evita doble registro por código ML; además las RPC usan UUID de operación para idempotencia.
- El coste se captura en el renglón nuevo para preservar histórico; pedidos viejos sin costo capturado no se revalúan silenciosamente.

### Seguridad

Las variables `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `CRON_SECRET` son exclusivas de servidor. No incluir sus valores en archivos públicos, capturas, el repositorio ni el chat. RLS protege todas las tablas privadas; la vista `public_storefront` solamente expone catálogo habilitado.
