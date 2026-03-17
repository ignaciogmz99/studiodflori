// Este archivo se conserva vacio. La persistencia de comprobantes ocurre
// en los webhooks de MercadoPago y Stripe, que son la fuente de verdad.
// El endpoint /confirm-paid fue eliminado porque era llamado desde el cliente
// sin verificar que el pago realmente ocurrio en el proveedor de pagos.
