# Pendientes

Tareas que quedaron para hacer a mano. Al terminar una, marcarla con `[x]` y anotar la fecha.

## Despliegue de los cambios del 2026-10-12 (confirmación de pendientes, CAPTCHA, login)

- [ ] **Base de producción:** antes de pasar el código a `main`, aplicar la migración `20261012120000_pedido_de_confirmacion` (solo agrega una columna):
  `npx prisma migrate deploy` con la `DATABASE_URL` de producción. En la base de desarrollo ya está aplicada.
- [ ] **Cloudflare Turnstile (CAPTCHA):**
  1. Entrar a [dash.cloudflare.com](https://dash.cloudflare.com) (cuenta gratis) → Turnstile → *Add widget*.
  2. Modo *Managed*; dominios: `agendate-tu-mismo.vercel.app` y `localhost`.
  3. Copiar las dos claves a Vercel → Settings → Environment Variables, en **Preview** y **Production**:
     `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (clave del sitio) y `TURNSTILE_SECRET_KEY` (clave secreta).
  4. Volver a desplegar (la clave del sitio se incorpora al compilar). Con una sola de las dos claves, el CAPTCHA queda apagado.
- [ ] **Probar en `dev` (preview)** con un calendario conectado: reservar un turno y ver que aparece el CAPTCHA y que la reserva entra.
- [ ] **Login:** después del despliegue, entrar una vez al panel desde tu navegador habitual (así queda marcado como dispositivo conocido).

## Configuración de cuentas

- [ ] **GitHub:** pasar el repositorio a privado (Settings → General → *Danger Zone* → *Change visibility*).
- [ ] **Vercel Firewall:** reglas de límite de pedidos para las rutas de reserva, disponibilidad y login (Claude puede configurarlas con tu OK).
- [ ] **MFA** en GitHub, Vercel, Neon, Google Cloud, Azure y Resend.

## Para más adelante

- [ ] Decidir qué hacer con la invitación del calendario mientras el turno está pendiente (se pospuso el 2026-10-12).
- [ ] Prioridades P2–P4 del informe de seguridad (carpeta `seguridad/`, local, fuera de Git).
