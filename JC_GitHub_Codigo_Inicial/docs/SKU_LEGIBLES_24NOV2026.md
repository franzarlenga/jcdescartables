# SKU legibles · JC Gestión / Tienda

Se modificaron 336 de los 337 SKU de referencia.
Regla: PRODUCTO_MARCA_MEDIDA (o modelo, capacidad, variante de línea). Ej.: ARR_ROL_1520.
El mismo artículo conserva un SKU tanto vendido por bulto como por unidad. La presentación no se codifica por separado salvo que el PDF describa artículos empaquetados diferentes.

La migración 005 cambia el SKU de jc_products SIN modificar sus UUID, stock, precios, fotos ni grupos. Conserva el código viejo en jc_sku_aliases, y los pedidos previos permanecen con su SKU histórico.

IMPORTANTE: este ZIP no fue conectado ni migrado en una base Supabase en vivo. La tienda V3 conserva su aspecto público sin enlaces a Gestión. No vender ni sincronizar con ML hasta validar las referencias.
