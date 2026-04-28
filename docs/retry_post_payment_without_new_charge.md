# Reintentar PDF y WhatsApp sin hacer otra compra

Estos endpoints solo reprocesan el post-pago de un pago ya aprobado. No crean un nuevo cargo.

## Configuracion requerida en Railway

Agrega una variable segura al servicio del backend:

```text
POST_PAYMENT_RETRY_SECRET=un-secreto-largo
```

## Mercado Pago

```powershell
$headers = @{
  "x-post-payment-retry-secret" = "un-secreto-largo"
  "Content-Type" = "application/json"
}

$body = @{
  paymentId = "156723935366"
  orderId = "ord_1777340661284_083u5njuiw"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://studiodflori-production.up.railway.app/api/mercadopago/retry-post-payment" `
  -Headers $headers `
  -Body $body
```

## Stripe

```powershell
$headers = @{
  "x-post-payment-retry-secret" = "un-secreto-largo"
  "Content-Type" = "application/json"
}

$body = @{
  paymentIntentId = "pi_..."
  orderId = "ord_..."
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://studiodflori-production.up.railway.app/api/stripe/retry-post-payment" `
  -Headers $headers `
  -Body $body
```

## Si quedo atorado en "otra instancia"

Usa `force = $true` solo cuando ya viste que `pdf_processing_started_at` o `whatsapp_processing_started_at` quedaron atorados y no hay PDF/WhatsApp.

```powershell
$body = @{
  paymentId = "156723935366"
  orderId = "ord_1777340661284_083u5njuiw"
  force = $true
} | ConvertTo-Json
```

Respuestas esperadas:

- `200`: PDF/WhatsApp quedaron procesados o ya estaban procesados.
- `202`: otra instancia sigue procesando; espera unos segundos y revisa los logs.
- `500`: ya es un error real; revisar `processing_last_error` y los logs `[receipt pdf]` o `[whatsapp]`.
