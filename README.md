# Agendate Tú Mismo — MVP

Motor de reservas de citas para profesionales/emprendedores. El cliente
elige un horario libre en una página pública y el turno queda creado
automáticamente en el calendario real del profesional (Google y/o Outlook),
con confirmación por WhatsApp y respaldo por email — sin llamadas, sin ida
y vuelta de correos.

Es la primera pieza del proyecto de agendamiento descrito en el informe
`Informe - Implementacion Agendate Tu Mismo y Agente AgendaFacil.docx`
(carpeta principal del proyecto). Comparte el mismo enfoque de
sincronización (Google Calendar API + Microsoft Graph API) que se usará
más adelante para integrarse con Agente AgendaFácil.

## Qué incluye este MVP

- Página pública de reserva (`/reservar/{slug}`): elegir servicio (si hay más de uno), elegir día, elegir horario, completar nombre/WhatsApp, confirmar.
- Disponibilidad calculada en tiempo real, fusionando Google Calendar **y** Outlook a la vez.
- Creación automática del evento en el calendario que el profesional elija como "calendario de reservas".
- Confirmación por WhatsApp (plantilla aprobada por Meta), con respaldo por email y, si se configura, aviso a un canal de Microsoft Teams.
- Cancelación por link, sin necesidad de crear cuenta.
- Reprogramación de turnos desde el panel (Reservas o Agenda → Reprogramar), moviendo el evento en el calendario real y avisando al cliente.
- Gestión de Servicios (nombre, duración y precio informativo) desde Configuración; el cliente elige entre ellos en la página pública.
- Panel (`/admin`) con: Panel (métricas y próximos turnos), Agenda semanal, Reservas (buscador, filtros y acciones), Calendarios, y Configuración (datos básicos, horario, servicios, notificaciones).
- Selector de profesional en el panel: una misma cuenta admin puede gestionar varios profesionales/integrantes del equipo, cada uno con su propio calendario, servicios y página de reserva.
- Botón "Compartir por WhatsApp" en el Panel y en Reservas: abre WhatsApp con el link de reserva y un mensaje ya cargados, sin tener que copiar y pegar aparte.
- Aviso por email al propio profesional (no solo al cliente) cuando hay un turno nuevo, reprogramado o cancelado — reutiliza el toggle de email de Configuración → Notificaciones, así se entera aunque no tenga Teams configurado.
- Resumen diario automático por email (`/api/cron/daily-summary`, ver sección 8): la agenda del día, sin tener que entrar al Panel a buscarla.

## Qué NO incluye todavía (a propósito, para no demorar el piloto)

- Alta propia de profesionales por fuera del panel admin (se suman vía `POST /api/admin/professionals`, sin login propio por profesional todavía).
- Canal de Telegram para notificaciones (queda como "próximamente" en Configuración → Notificaciones).
- Plantilla de WhatsApp aprobada específicamente para cancelaciones (se reutiliza la de confirmación para reprogramaciones; las cancelaciones solo avisan por email/Teams).
- Reconfirmación o cancelación respondiendo al WhatsApp (queda un webhook receptor listo como punto de extensión en `src/app/api/webhooks/whatsapp/route.ts`).
- Múltiples tramos horarios por día en la UI de configuración (el modelo de datos sí lo soporta; ver nota en la página de Configuración).

## 1. Requisitos

- Node.js 20+
- Una base de datos PostgreSQL (para el piloto sirve una gratuita de [Neon](https://neon.tech) o [Supabase](https://supabase.com))
- Cuenta de Google Cloud (para Google Calendar API)
- Cuenta de Azure / Microsoft (para Microsoft Graph / Outlook)
- Cuenta de Meta for Developers (para WhatsApp Business Cloud API) — puede tramitarse en paralelo, el sistema funciona sin ella (ver más abajo)

## 2. Instalación

```bash
npm install
cp .env.example .env
```

Completar `.env` con las credenciales de cada sección (el archivo tiene,
en cada bloque, el link exacto a donde se obtiene cada dato).

Generar las dos claves de seguridad:

```bash
openssl rand -base64 32   # para AUTH_SECRET
openssl rand -base64 32   # para TOKEN_ENCRYPTION_KEY (tiene que decodificar a 32 bytes, este comando ya lo hace)
```

Generar el hash de la contraseña de admin:

```bash
npx tsx scripts/hash-password.ts "la-contraseña-que-quieras"
# copiar la línea ADMIN_PASSWORD_HASH="..." resultante al .env
```

## 3. Base de datos

```bash
npx prisma migrate dev
```

Esto crea las tablas en la base de PostgreSQL de `DATABASE_URL` y regenera el
cliente de Prisma. Si ya tenías el proyecto corriendo desde antes de sumar
Servicios/Teams/multi-profesional, alcanza con volver a correr este mismo
comando: aplica la migración nueva (`add_services_teams_multiprofessional`)
sin tocar los datos existentes.

## 4. Credenciales de calendario

### Google Calendar
1. [Google Cloud Console](https://console.cloud.google.com/) → crear proyecto.
2. Habilitar **Google Calendar API**.
3. Crear credencial **OAuth 2.0 Client ID** (tipo *Web application*).
4. Redirect URI autorizado: `{APP_URL}/api/auth/google/callback`
5. Copiar Client ID y Client Secret a `.env`.

### Outlook / Microsoft 365
1. [Azure Portal](https://portal.azure.com/) → Azure Active Directory → App registrations → New registration.
2. Tipo de cuenta soportada: "Cuentas en cualquier organización y personales de Microsoft".
3. Redirect URI (Web): `{APP_URL}/api/auth/outlook/callback`
4. En **API permissions**, agregar permisos delegados: `Calendars.ReadWrite`, `offline_access`, `User.Read`.
5. En **Certificates & secrets**, crear un client secret.
6. Copiar Application (client) ID y el secret a `.env`.

## 5. WhatsApp (puede hacerse en paralelo, no bloquea el resto)

Ver `docs/whatsapp-template.md` para el paso a paso de la plantilla que hay
que mandar a aprobar a Meta. Mientras no esté aprobada, el sistema sigue
funcionando: la reserva se confirma igual en el calendario, solo que sin el
mensaje de WhatsApp (queda registrado como pendiente en la tabla de logs).

## 6. Levantar el proyecto

```bash
npm run dev
```

- Panel del profesional: `http://localhost:3000/admin/login` (usar `ADMIN_EMAIL` / la contraseña que hasheaste)
- Al entrar por primera vez, se crea automáticamente tu perfil de profesional piloto.
- Ir a **Calendarios** → conectar Google y/o Outlook → elegir cuál usar para las reservas.
- Ir a **Configuración** → definir horario de atención, duración del turno, anticipación mínima.
- Compartir la página pública que aparece en **Reservas**: `/reservar/{tu-slug}`.

## 7. Resumen diario automático

`/api/cron/daily-summary` manda por email, a cada profesional activo con
`notifyEmail` habilitado, la agenda del día (turnos de hoy, y si hubo algún
aviso a un cliente que falló ayer). No requiere ninguna dependencia nueva ni
IA — es la respuesta directa a que ambas ideas originales piden un
resumen/reporte automático (ver `docs/Propuesta-funcionalidades-faltantes-MVP.docx`).

Para que se dispare solo:

1. Definir `CRON_SECRET` en `.env` (una palabra clave propia, igual que las demás).
2. Al desplegar en Vercel, el archivo `vercel.json` ya deja configurado que
   Vercel Cron llame a esta ruta todos los días a las 11:00 UTC (8:00 en
   Uruguay) — Vercel agrega automáticamente el header `Authorization: Bearer
   $CRON_SECRET` si la variable está configurada en el proyecto.
3. Si se prefiere no depender de Vercel Cron (o mientras se prueba en
   local), se puede llamar a mano o desde cualquier scheduler externo
   (cron-job.org, n8n) con:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/daily-summary
   ```

## 8. Antes de pasar del piloto a producción

- Reemplazar la autenticación de admin (hoy es 1 usuario por variables de entorno) por un modelo de usuarios real si se suma más de un profesional.
- Servir la app por HTTPS (Vercel, Railway o similar) — Google y Microsoft no aceptan `http://` como redirect URI en producción.
- Revisar la política de privacidad simple mencionada en el informe de implementación antes de sumar al primer cliente real.
- Configurar backups de la base de datos.

## Estructura del proyecto

```
src/
  app/
    reservar/[slug]/       página pública de reserva
    cancelar/[token]/      cancelación sin login
    admin/                 panel del profesional (protegido)
    api/                   endpoints (disponibilidad, reservas, OAuth, admin)
  components/               componentes de UI (cliente)
  lib/
    calendar/               conectores Google y Outlook + manejo de tokens
    notifications/          WhatsApp + email
    availability.ts         servicio de disponibilidad unificado (el núcleo)
    booking.ts              flujo de creación/cancelación de reservas
    dailySummary.ts         cálculo del resumen diario (ver sección 7)
    auth.ts                 sesión de admin
prisma/
  schema.prisma             modelo de datos
docs/
  whatsapp-template.md      plantilla a aprobar en Meta
  Propuesta-funcionalidades-faltantes-MVP.docx   gap analysis vs. ideas originales
scripts/
  hash-password.ts          utilidad para generar ADMIN_PASSWORD_HASH
vercel.json                 config de Vercel Cron (resumen diario)
```
