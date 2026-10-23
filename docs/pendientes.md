# Pendientes

Tareas que quedaron para hacer a mano. Al terminar una, marcarla con `[x]` y anotar la fecha.

## Despliegue de los cambios del 2026-10-12 (confirmación de pendientes, CAPTCHA, login)

- [x] **Base de producción:** migración `20261012120000_pedido_de_confirmacion` aplicada en la rama `production` de Neon el 2026-10-13. Código pasado a `main` (`03ca920`) el mismo día.
- [x] **Cloudflare Turnstile (CAPTCHA):** activo en producción y probado con una persona real el 2026-10-13. Ojo: en un navegador automatizado (el de Claude) nunca se resuelve; para probar, usar Chrome o el celular. Diagnóstico: `/prueba-captcha` en la versión de pruebas (no existe en producción).
- [x] **Probar en producción:** reserva con CAPTCHA probada en Chrome el 2026-10-13.
- [ ] **Login:** después del despliegue, entrar una vez al panel desde tu navegador habitual (así queda marcado como dispositivo conocido).

## Configuración de cuentas

- [ ] **GitHub:** pasar el repositorio a privado (Settings → General → *Danger Zone* → *Change visibility*).
- [x] **Vercel Firewall:** regla "Limite API publica (login, reservas, disponibilidad)" publicada en producción el 2026-10-16: 40 pedidos/min por IP en `/api/auth/admin`, `/api/bookings` y `/api/availability`, responde 429. El plan Hobby admite una sola regla de límite, por eso las tres rutas comparten el contador.
- [ ] **MFA** en GitHub, Vercel, Neon, Google Cloud, Azure y Resend.
- [ ] **Secretos distintos por entorno:** hoy `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` y `RESEND_API_KEY` tienen el mismo valor en desarrollo, pruebas y producción (visto en Vercel el 2026-10-13). Generar valores nuevos para producción. Ojo: cambiar `TOKEN_ENCRYPTION_KEY` obliga a volver a cifrar (o reconectar) los calendarios.

## Para más adelante

- [x] Invitación del calendario mientras el turno está pendiente: decidido el 2026-10-16 invitar recién al confirmar. El evento se crea sin invitado; al confirmar (panel o link del email) se agrega al cliente. Código en `dev` sin commit todavía: falta probar en la versión de pruebas y pasar a `main`.
- [x] Prioridades P2–P4 del informe de seguridad cargadas en Jira el 2026-10-16 (INV43-36 a INV43-43, etiqueta `seguridad`). Los hallazgos abiertos del QA exploratorio del 6/10 están en INV43-24 a INV43-35 (etiqueta `qa-exploratorio-2026-10-06`).
