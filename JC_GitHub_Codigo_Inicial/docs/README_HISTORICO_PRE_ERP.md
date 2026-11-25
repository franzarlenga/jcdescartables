# JC · Tienda pública V3 (separada de JC Gestión)

Esta versión contiene **solamente la tienda pública** y no sustituye JC Gestión V12.
El acceso administrativo simplificado ha sido excluido de la aplicación pública.
La administración final se incorporará en el ERP privado, con autenticación y permisos del servidor.
No existe en esta versión un editor de precios/stock; los datos se preparan en Supabase y
la interfaz administrativa deberá integrarse con el JC Gestión aprobado.

La vista previa `preview/JC_Tienda_Home_Completa_V3.html` permite explorar la home y
el catálogo sin exponer costos de compra ni un panel administrativo. Es una demo local
y no guarda pedidos reales.

## Estado
- Base de 337 SKU y 82 grupos de catálogo, con 7 categorías y 31 subcategorías.
- Home V3 aprobada, navegación, variantes, carrito.
- Los cobros y la sincronización real con ERP **no están habilitados**.
- Falta migrar JC Gestión V12 a una app privada conectada a la misma base Supabase.
- No usar la tienda en producción con plan Vercel Hobby.

# JC Gestión + Tienda Online · V2 catálogo profesional

**Desarrollo entregado, no desplegado.** El proyecto es una base real de Next.js + Supabase; la vista previa HTML es solamente una demostración local. **No hay un checkout habilitado para cobros reales** y ningún artículo se publicará sin stock, precio de venta y autorización.

## Archivos principales

- `preview/JC_Tienda_Catalogo_Profesional_V2.html`: **vista previa interactiva sin instalación**, con 337 SKU y 82 grupos. Permite probar catálogo por rubro → subcategoría → marca, detalle por medida y presentación, cantidad `− / +`, carrito local, administración de precios, stock, fotos y grupos. Los cambios que hagas aquí se guardan solo en el navegador; **no sincronizan con Supabase**. No usarla como fuente final de stock.
- `app/page.tsx`, `components/store.tsx`, `app/globals.css`: tienda profesional de producción, responsive, con catálogo público únicamente de productos habilitados.
- `app/admin/page.tsx`: panel protegido con Supabase Auth para inventario, fotografías, precios de bulto/individual, categorías, grupos comerciales, pedidos web y cobros verificados.
- `supabase/migrations/001_jc_store.sql`: estructura de inventario, pedidos, reservas, cobros, imagen pública y autenticación.
- `supabase/migrations/002_seed_catalog.sql`: importación de los **337 SKU** y sus costos, con marca operativa **JC** en las 134 referencias sin marca declarada. **No carga stock ni precios de venta.**
- `supabase/migrations/003_categories_and_full_catalog.sql`: añade **7 rubros**, **31 subcategorías** y **76 grupos comerciales** adicionales a los seis pilotos, dando **82 grupos**. Los nuevos grupos son borradores; se vinculan categorías a todos los productos.
- `scripts/generate_catalog_v2.py`: regenera la migración V2 desde el catálogo fuente; `data/jc_catalog_preview.json` contiene metadatos del catálogo.

## Funcionalidades

**Tienda pública:** catálogo por rubro, subcategoría y marca; búsqueda por SKU, nombre o medida; orden por precio/nombre; ficha de grupo con variantes independientes y presentaciones bulto/individual; cantidades `− / número / +`; carrito; formulario de compra sin usuario y redirección a Checkout Pro cuando se habilite. Puede mostrar imágenes que se carguen en el ERP. Mantiene costos/proveedores exclusivamente en backend privado.

**JC Gestión:** autenticación real vía Supabase; carga de fotografías por SKU y portada por grupo; conteo físico y equivalencia base; precio separado por unidad o bulto; clasificación y edición de categorías/subcategorías; nombre y categoría de cada grupo; activar/ocultar publicación; pedidos web, cobros y entregas parciales. El stock lo comparte la tienda y las ventas, sin deducción duplicada. El pedido reserva; la entrega física descuenta.

**Estado de publicación:** todos los nuevos grupos están ocultos. La vista pública solo expone ofertas si se cumplen estas condiciones: grupo publicado + SKU activo + presentación habilitada + precio de venta ingresado + stock físico contado y disponible. El resto solo existe en el panel privado. No se inventan precios de venta, fotos, clientes ni existencias.

## Puesta en marcha — Supabase Free + Vercel Hobby (solo pruebas)

1. Crear proyecto de Supabase para **JC**, independiente de FIERRO.
2. Ejecutar los archivos SQL en **este orden** en Supabase SQL Editor:
   - `001_jc_store.sql`
   - `002_seed_catalog.sql`
   - `003_categories_and_full_catalog.sql`
   Si la etapa 1 ya estaba instalada, **ejecutar solo `003`**. No duplicar la carga ni alterar los costos históricos.
3. Supabase Authentication → Users: crear el administrador y autorizar su UUID:
   ```sql
   insert into public.jc_admin_users(user_id)
   values ('UUID_DEL_ADMIN') on conflict do nothing;
   ```
4. Duplicar `.env.example` como `.env.local`, completar claves de **JC**, sin compartir `SUPABASE_SERVICE_ROLE_KEY` ni `MP_ACCESS_TOKEN` públicamente. Mantener `CHECKOUT_ENABLED=false`.
5. Con Node 20+ y conexión a npm, ejecutar:
   ```bash
   npm install
   npm run dev
   ```
6. Abrir `http://localhost:3000/admin`, iniciar sesión, cargar **precio de venta, foto y stock** de un artículo real; después entrar a **Publicaciones**, corregir la categoría del grupo y habilitarlo. En `http://localhost:3000` debería verse el producto público.
7. Configurar las credenciales de prueba de Mercado Pago, URLs y webhook y validar pagos aprobados, pendientes, rechazados, expirados y posteriores a la liberación de stock antes de habilitar compras reales. No operar comercialmente en Vercel Hobby.
8. Al pasar a Vercel Pro y antes de cobrar clientes reales: verificar límites/monitoreo, RLS, pruebas de concurrencia, protección anti-abuso/rate-limit, política de envíos, términos, privacidad, facturación y backups.

## Pruebas ejecutadas en esta entrega

- **8 pruebas Node**: identidad y cantidad de SKU, categorías, borradores, aislamiento de costos, prevención estructural de doble cobro y stock al entregar.
- Comprobación sintáctica de los componentes TypeScript/TSX modificados.
- **Navegador de escritorio (1440×900) y móvil (390×844)** sobre el HTML: rubros, filtrado, variantes, detalle, modo Gestión y edición, sin errores JavaScript.
- Recorrido de prueba local: **ARR_ROL_1520 → stock → precio bulto/rollo → habilitación de publicación → tienda → carrito**, sin errores.

**Validaciones que faltan**: instalación npm y compilación completa contra dependencias (no disponibles en este entorno), conexión y prueba SQL en un proyecto Supabase, test de Mercado Pago, accesos reales, sincronización de fotos y pagos, y puesta en marcha en Vercel. Ninguna prueba local debe interpretarse como autorización para producir cobros reales.

## Referencias y límites de esta etapa

- `data/ATLAS_Catalogo_Importacion.csv` deriva de la lista de costos JC de fecha **15/11/2026**. El dato de marca JC en 134 productos es **marca operativa**, no una atribución del fabricante; se conserva el proveedor original.
- **Los 82 grupos son una primera organización comercial automática y editable**, no categorías verificadas de Mercado Libre. Requieren revisión de agrupación en los casos con líneas parecidas.
- Las integraciones de publicaciones de Mercado Libre, pasarela real, envíos tarifados, ERP V12 completo, facturación y devoluciones quedan pendientes. `JC Gestión` en este proyecto administra el núcleo de tienda y stock, no significa que la antigua V12 ya haya migrado toda su lógica.
- Instrucciones técnicas de Fase 1 en `docs/README_FASE1_BASE.md` (solo como referencia histórica; prevalecen las cifras y migraciones de este README).


## V3 — Inicio comercial enriquecido

Se amplió la home siguiendo una estructura comercial: navegación por rubros, banners, líneas, soluciones por actividad, presentaciones por unidad/bulto, cómo comprar y FAQ. El contenido comercial del hero y banners se edita en **Gestión → Inicio**, con persistencia en `jc_home_content` tras ejecutar `supabase/migrations/004_home_content.sql`. No se copian precios, descuentos, fotos ni condiciones de otras tiendas. La tienda no se pone en producción hasta conectar Supabase, pagos, stock, entregas y confirmar condiciones comerciales.

### Diferencia entre Inicio y Catálogo
La portada muestra una selección breve de hasta nueve grupos comerciales. El botón **Ver catálogo completo**, la navegación por categoría y el buscador permiten explorar todas las referencias sin transformar la home en una lista interminable. En la vista previa, los 337 SKU y 82 grupos son administrables, pero los artículos sin precio/stock publicados no constituyen ofertas reales.

## Decisiones comerciales JC / 24 noviembre 2026

- **Datos de contacto:** Zelada 5561, Villa Luro, CABA; tel. 11 5053-3078. El mail está pendiente. Esta dirección de contacto **no implica** que el retiro esté habilitado.
- **Proveedor tienda propia confirmado:** Mercado Pago Checkout Pro. Mercado Libre continúa separado y sus ventas se registran **manualmente en el ERP**, con comisiones/envíos. La tienda no requiere cuenta del comprador.
- **Estado real:** `CHECKOUT_ENABLED=false` y credenciales de prueba, sin cuenta conectada ni cobros habilitados. No compartir tokens por chat.
- **Historial financiero:** se agregó migración 006 para retener en `jc_mp_payments` el neto informado por MP, medio de pago, cuotas y detalle de cargos cuando MP lo incluya. El bruto ya está en `amount_cents`. **No confundir venta aprobada con dinero acreditado**; la conciliación final requiere verificar movimientos de MP.
- El código existente de checkout usa **Preferences API**, admitida pero legado. Mercado Pago ahora recomienda **Orders API para nuevas integraciones**; evaluar migración y probar antes de salir a producción.
- No hay cantidad máxima de cuotas elegida: variable opcional `MP_MAX_INSTALLMENTS` sin valor inicial. Sin inventar promociones de cuotas sin interés.
- El menor costo de comercialización frente a Mercado Libre puede aumentar el margen, pero depende de las tarifas de MP, logística, publicidad, impuestos, contracargos y financiación.

## Actualización 24/11/2026 — Costos + precios tienda por SKU (migración 007)

**Estado:** módulo preparado para el proyecto Next.js/Supabase; todavía NO desplegado ni conectado a una base real. Las migraciones 001–006 deben ejecutarse primero, luego `supabase/migrations/007_costos_y_precios.sql`. El código de la tienda V3 está preservado; este archivo agrega una ruta **privada** `/gestion/precios`, no un acceso público a Gestión, y no reemplaza el ERP V12 pendiente de migración total.

- **Origen de costos:** los 337 SKU del PDF JC del 15/11/2026 ya vienen con `jc_products.purchase_cost_ars`. El costo es **por la presentación original de compra**, no siempre por unidad. Se conserva el valor inicial en `original_purchase_cost_ars`. `jc_products.pack_base_qty` permite consultar costo por unidad de inventario.
- **Precios públicos:** son independientes, por SKU y por forma de venta. `jc_offers.price_cents` distingue `pack` (bulto cerrado) y `unit` (unidad / rollo); ambos consumen el mismo stock. Se mantienen sin cargar (`NULL`) hasta que el administrador los indique.
- **Pantalla privada:** iniciar sesión con una cuenta autorizada en `jc_admin_users`, acceder a `/gestion/precios`, filtrar familia/marca/buscar SKU, modificar manualmente costo, precio de bulto y precio individual en una única transacción.
- **Porcentajes:** seleccionar artículos y aplicar **incremento/rebaja del costo**, **incremento/rebaja del precio de bulto**, **incremento/rebaja del precio individual**. Otra opción explícita **“Desde costo + recargo %”** permite crear precios iniciales basados en el costo y en el factor de la presentación, sin confundir recargo con margen sobre venta. Mostrar vista previa antes de guardar.
- **Auditoría:** `jc_pricing_operations` y `jc_pricing_changes` guardan usuario, fecha, SKU, presentación, valor anterior, nuevo y observación. Operaciones porcentuales usan UUID idempotente para protegerse de reintentos. Los pedidos ya creados conservan sus precios capturados al momento de la venta.
- **Publicación:** actualizar un precio **NO** activa el producto, NO cambia las existencias, NO modifica automáticamente otro precio y NO habilita Mercado Pago. La tienda pública consume los nuevos `price_cents` desde `public_storefront` solamente cuando el grupo/oferta está publicado, existe stock y el precio es positivo.
- **IVA:** el PDF identifica excepciones con IVA; los costos se conservan tal como fueron informados, sin inventar tasas o hacer conversiones fiscales automáticas. Revisar antes de usar recargos.
- **Modo de pruebas:** se mantiene `MP_TEST_MODE=true` y `CHECKOUT_ENABLED=false` hasta configurar credenciales de prueba de la cuenta del dueño y certificar el circuito. No compartir claves privadas por chat.

### Comprobaciones realizadas

`node --test tests/pricing-catalog.test.mjs` comprueba unicidad y presencia de costos en los 337 registros, la vinculación de columnas y las rutas de cambios. El TSX nuevo fue validado con el analizador sintáctico de TypeScript sin errores. **No se pudo ejecutar npm install ni compilar la app completa** porque el entorno no tiene acceso al registro de npm; no se ha probado la migración contra un PostgreSQL real. Esas pruebas siguen pendientes antes de operar con dinero y stock reales.
