# Plantilla de WhatsApp a aprobar en Meta

WhatsApp Business Cloud API exige que cualquier mensaje que abra una
conversación nueva (el negocio le escribe primero al cliente) use una
**plantilla pre-aprobada**. La aprobación de Meta puede tardar entre horas y
unos pocos días — conviene enviarla a revisión el primer día del proyecto,
en paralelo al resto del desarrollo.

## Cómo crearla

1. Ir a [Meta Business Suite](https://business.facebook.com/) → WhatsApp Manager → Plantillas de mensajes.
2. Crear una plantilla nueva:
   - **Nombre:** `confirmacion_turno` (debe coincidir con `WHATSAPP_TEMPLATE_NAME` en `.env`)
   - **Categoría:** Utilidad (Utility)
   - **Idioma:** Español

## Texto del cuerpo (body)

```
Hola {{1}}, tu turno de {{2}} con {{3}} quedó confirmado para el {{4}} a las {{5}}.
Si necesitás cancelar, respondé este mensaje o escribinos.
```

Los parámetros, en orden, son los que envía `src/lib/notifications/whatsapp.ts`:

| Parámetro | Contenido |
|---|---|
| {{1}} | Nombre del cliente |
| {{2}} | Nombre del servicio |
| {{3}} | Nombre del profesional |
| {{4}} | Fecha (ej. "martes 22 de julio") |
| {{5}} | Hora (ej. "10:00") |

## Después de la aprobación

No hace falta cambiar nada en el código: en cuanto la plantilla esté
aprobada, los mensajes empiezan a enviarse (siempre que `WHATSAPP_TOKEN` y
`WHATSAPP_PHONE_NUMBER_ID` estén configurados en `.env`). Mientras no esté
aprobada, el sistema sigue funcionando igual: la reserva se confirma en el
calendario y el intento de WhatsApp queda registrado como `SKIPPED` o
`FAILED` en `NotificationLog`, sin bloquear al cliente.
