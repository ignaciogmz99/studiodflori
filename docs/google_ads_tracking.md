# Google Ads y GA4

La instrumentacion de analytics para `Studio dei Fiori` ya quedo conectada al embudo de compra, pero se mantiene inactiva hasta que configures tus IDs de Google.

## Variables

Agrega en tu `.env` solo las que vayas a usar:

```env
VITE_GOOGLE_TAG_ID=
VITE_GA_MEASUREMENT_ID=
VITE_GOOGLE_ADS_ID=
VITE_GOOGLE_ADS_PURCHASE_LABEL=
```

## Configuraciones comunes

Solo GA4:

```env
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

GA4 + Google Ads:

```env
VITE_GOOGLE_TAG_ID=G-XXXXXXXXXX
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_GOOGLE_ADS_ID=AW-XXXXXXXXX
```

Solo conversion directa de compra en Google Ads:

```env
VITE_GOOGLE_ADS_ID=AW-XXXXXXXXX
VITE_GOOGLE_ADS_PURCHASE_LABEL=abcDEFghiJKLmnopQR
```

## Eventos ya conectados

- `page_view`: cambio de ruta dentro del sitio
- `view_item`: cuando el usuario entra a una flor
- `add_to_cart`: cuando agrega una flor al carrito
- `begin_checkout`: cuando entra al formulario de pago
- `add_shipping_info`: cuando completa entrega y avanza a tarjeta
- `purchase`: cuando el pago queda aprobado en `Mercado Pago` o `Stripe`

## Notas

- Los eventos no bloquean el checkout ni esperan respuesta de Google.
- No se envia nombre, telefono, direccion ni otros datos personales.
- `purchase` se deduplica por `orderId` para evitar compras duplicadas si el usuario recarga.
- Si configuras `VITE_GOOGLE_ADS_PURCHASE_LABEL`, tambien se dispara una conversion directa de Google Ads para la compra aprobada.
