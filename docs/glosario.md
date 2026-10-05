# Glosario de Agendate Tú Mismo

Este documento explica, en simple, los términos y herramientas que aparecen en el
proyecto. Está pensado para alguien con base en Java: cuando existe un
equivalente, se lo menciona.

**Cómo se usa:** cada vez que aparece una palabra o herramienta nueva, se agrega
acá con tres cosas:

- **Qué es**, en palabras simples.
- **Parecido en Java**, si lo hay.
- **En el proyecto**, para qué lo usamos y dónde.

Las entradas están agrupadas por tema. Al final hay un historial de cuándo se
agregó cada grupo.

---

## 1. Las piezas del proyecto

### TypeScript
Es JavaScript con tipos (como `String`, `int`) que se revisan antes de ejecutar.
- **Parecido en Java:** el sistema de tipos de Java. `tsc --noEmit` es como compilar solo para ver si hay errores.
- **En el proyecto:** todo el código está en TypeScript (archivos `.ts` y `.tsx`).

### React
Librería para construir pantallas con "componentes": piezas reutilizables (un botón, una tabla, un formulario).
- **Parecido en Java:** como los componentes de Swing o JavaFX, pero para la web.
- **En el proyecto:** las pantallas del panel y de la página pública están hechas con componentes, en `src/components`.

### Next.js
Framework (estructura de trabajo) que usa React y además se encarga de las rutas, del servidor y de la compilación.
- **Parecido en Java:** Spring Boot, que junta web, servidor y configuración en uno.
- **En el proyecto:** cada carpeta dentro de `src/app` es una dirección de la web. Un archivo `page.tsx` es una pantalla y un `route.ts` es un endpoint (ver más abajo).

### Componente de servidor y componente de cliente
En Next.js, algunos componentes se arman en el servidor (pueden leer la base de datos) y otros en el navegador (pueden reaccionar a clics). Los de cliente empiezan con `"use client"`.
- **En el proyecto:** las páginas (`page.tsx`) suelen ser de servidor y leen la base; los formularios y modales son de cliente.

### Tailwind CSS
Forma de dar estilo escribiendo clases cortas directamente en el elemento (`rounded-lg`, `text-sm`) en lugar de un archivo CSS aparte.
- **En el proyecto:** todo el aspecto visual (colores, espacios, tamaños) está en el atributo `className`.

### Zod
Librería para validar datos que llegan desde afuera (formularios, peticiones) con un "esquema".
- **Parecido en Java:** Bean Validation (`@NotNull`, `@Size`).
- **En el proyecto:** cada ruta de la API define un esquema (por ejemplo, el nombre debe tener entre 2 y 80 caracteres). Está en `src/app/api` y en `src/lib/validation.ts`.

### Luxon
Librería para trabajar con fechas, horas y zonas horarias.
- **Parecido en Java:** `java.time` (`LocalDateTime`, `ZonedDateTime`, `Duration`).
- **En el proyecto:** calcula los horarios libres y convierte entre zonas horarias (`src/lib/availability.ts`).

### npm y `package.json`
`npm` es el gestor de paquetes de JavaScript. `package.json` lista las librerías que usa el proyecto y sus versiones.
- **Parecido en Java:** Maven o Gradle y su `pom.xml` / `build.gradle`.
- **En el proyecto:** `npm install` descarga las librerías; `package-lock.json` fija las versiones exactas.

---

## 2. Base de datos

### PostgreSQL (Postgres)
Base de datos relacional (tablas, filas, SQL). Es la que guarda profesionales, turnos, servicios, etc.
- **En el proyecto:** corre en Neon.

### Neon
Servicio en la nube que aloja la base Postgres. Si no se usa un rato, "se duerme" y la primera consulta tarda unos segundos (arranque en frío).
- **En el proyecto:** hay dos bases en Neon: una de desarrollo y otra de producción.

### Prisma
Herramienta para hablar con la base desde el código sin escribir SQL a mano. El archivo `prisma/schema.prisma` describe las tablas.
- **Parecido en Java:** JPA / Hibernate (un ORM).
- **En el proyecto:** `prisma.booking.create(...)` crea un turno; `prisma.booking.findMany(...)` los lista.

### Migración
Un archivo con los cambios a la estructura de la base (crear una tabla, agregar una columna). Se aplica en orden y queda registrado.
- **Parecido en Java:** Flyway o Liquibase.
- **En el proyecto:** carpeta `prisma/migrations`. Se aplican con `npx prisma migrate deploy`. Las migraciones **no** corren solas al desplegar: hay que ejecutarlas a mano contra cada base.

### Migración aditiva (columnas opcionales)
Una migración que solo **agrega** columnas opcionales o con un valor por defecto. No toca los datos que ya existen, así que es la más segura de aplicar.
- **En el proyecto:** las columnas de videollamada y de recordatorio se agregaron así. Importa el orden: la migración se aplica **antes** de publicar el código que las usa.

### Restricción de exclusión (EXCLUDE)
Regla dentro de la base que impide que dos filas se "pisen". En nuestro caso, dos turnos del mismo profesional en horarios que se solapan.
- **En el proyecto:** la restricción `Booking_no_overlap` evita la doble reserva aunque dos personas reserven a la vez.

### Upsert y `ON CONFLICT`
**Upsert** es "insertar, y si ya existe, actualizar" en una sola operación. En Postgres se escribe `INSERT ... ON CONFLICT DO UPDATE`.
- **Parecido en Java:** un `saveOrUpdate` de Hibernate, pero resuelto dentro de la base.
- **En el proyecto:** el contador del límite de peticiones suma 1 con una sola instrucción, sin leer antes.

### Índice (de base de datos)
Estructura que acelera las búsquedas, como el índice de un libro.
- **En el proyecto:** por ejemplo, `Booking` tiene un índice por profesional y hora de inicio para listar rápido la agenda.

### Transacción
Un grupo de operaciones sobre la base que se aplican todas juntas o ninguna.
- **Parecido en Java:** `@Transactional` / `commit` y `rollback`.

---

## 3. Publicar y trabajar con versiones

### Git, rama (branch), commit y push
Git guarda el historial del código. Una **rama** es una línea de trabajo; un **commit** es un punto guardado con un mensaje; **push** sube los commits al servidor.
- **En el proyecto:** trabajamos en la rama `dev` (pruebas) y llevamos a `main` (producción) con `git push origin dev:main`.

### Vercel, deploy, preview y producción
**Vercel** es donde está publicada la app. Un **deploy** es una publicación nueva. **Producción** es lo que ven los clientes (rama `main`). Un **preview** es una copia de prueba que se genera con cada push a otra rama (`dev`).
- **En el proyecto:** cada entorno tiene sus propias variables y su propia base de datos.

### Variable de entorno (`.env`)
Un dato de configuración que no va dentro del código (claves, direcciones, contraseñas). En tu computadora vive en el archivo `.env`; en Vercel, en Settings → Environment Variables.
- **Parecido en Java:** `application.properties` o `System.getenv()`.
- **En el proyecto:** `DATABASE_URL`, `APP_URL`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, etc. **Nunca se suben a Git.**

### Cron (tarea programada)
Una tarea que el sistema ejecuta sola a una hora fija, todos los días.
- **Parecido en Java:** `@Scheduled(cron = "...")` de Spring.
- **En el proyecto:** Vercel llama a una dirección de la app cada día (se configura en `vercel.json`). Una manda el resumen diario y otra los recordatorios del día anterior. Cada llamada lleva un secreto (`CRON_SECRET`) para que nadie más pueda dispararla.

### Build (compilar)
Convertir el código en la versión final lista para publicar. `npm run build` lo hace.

### Cold start (arranque en frío)
Cuando una función en la nube lleva un rato sin usarse, la primera llamada tarda más porque tiene que "arrancar".

---

## 4. Conectar con otros servicios

### API, endpoint y ruta
Una **API** es la forma en que un programa le pide cosas a otro. Un **endpoint** (o ruta) es una dirección concreta, por ejemplo `/api/bookings`.
- **Parecido en Java:** un método de un `@RestController`.
- **En el proyecto:** los archivos `route.ts` dentro de `src/app/api`.

### Código de estado HTTP
Número con que un servidor responde a cada petición para decir cómo salió.
- **Los que usamos:** `200` todo bien, `400` los datos enviados son inválidos, `401` falta autenticación o las credenciales son incorrectas, `404` no existe, `409` conflicto (por ejemplo, el horario ya fue tomado), `429` demasiadas peticiones, `500` falló algo inesperado en el servidor.
- **En el proyecto:** cada ruta de `src/app/api` devuelve el código que corresponde, y la pantalla muestra el mensaje según el caso.

### Webhook
Una dirección de tu app a la que otro servicio le avisa cuando pasa algo (en lugar de que tu app pregunte cada tanto).
- **En el proyecto:** `/api/webhooks/whatsapp` recibe avisos de Meta.

### OAuth
Forma segura de darle permiso a una app para usar tu cuenta de otro servicio (Google, Microsoft) **sin darle tu contraseña**.
- **En el proyecto:** así conectamos Google Calendar y Outlook. Los pasos están en `src/app/api/auth/`.

### Token de acceso y token de refresco (refresh token)
El **token de acceso** es una llave temporal (dura cerca de una hora). El **token de refresco** sirve para pedir un token de acceso nuevo sin que la persona vuelva a autorizar.
- **En el proyecto:** se guardan **cifrados** en la tabla de conexiones de calendario (`src/lib/crypto.ts`).

### URI de redirección (redirect URI)
Dirección a la que Google o Microsoft devuelven a la persona después de autorizar. Tiene que estar registrada en la consola del proveedor, exactamente igual.
- **En el proyecto:** `.../api/auth/google/callback` y `.../api/auth/outlook/callback`.

### Firma de un webhook
Un código que acompaña a cada aviso que llega a un webhook y prueba que lo mandó el servicio verdadero. Se calcula con un HMAC y una clave secreta que solo conocen ambos lados.
- **En el proyecto:** el webhook de WhatsApp rechaza cualquier aviso cuya firma (`X-Hub-Signature-256`) no coincida, para que nadie pueda inventar avisos.

### IMAP y CalDAV
Dos estándares abiertos. **IMAP** sirve para leer el correo de cualquier proveedor. **CalDAV** sirve para leer y escribir calendarios de cualquier proveedor, no solo de Google o Microsoft.
- **En el proyecto:** la idea 5C2F5 los menciona para conectar cualquier calendario. Hoy solo están Google y Outlook.

### SSO (inicio de sesión único)
Entrar a muchas aplicaciones con la misma cuenta de la empresa (por ejemplo, la de Microsoft), sin crear una contraseña en cada una.
- **En el proyecto:** hoy el panel tiene un solo administrador con contraseña; SSO y roles por persona quedan para una etapa posterior.

### n8n
Herramienta para armar automatizaciones conectando servicios, uniendo bloques en un diagrama en vez de programar.
- **En el proyecto:** la idea 5C2F5 la proponía como stack. Se construyó una aplicación propia en su lugar, que cubre el mismo objetivo.

### Actualizar un evento (`patch`) en vez de borrarlo y crearlo
Cambiar solo lo que cambió de un evento (por ejemplo, su horario) conserva todo lo demás: el link de la videollamada, los invitados y su historial. Borrar y volver a crear genera un evento distinto, con otro link, y los invitados reciben una cancelación y una invitación nueva.
- **En el proyecto:** al reprogramar un turno se mueve el mismo evento del calendario. Si el evento ya no existe porque se borró a mano, recién ahí se crea uno nuevo.

### Invitación del calendario (`sendUpdates`)
Cuando un evento tiene invitados, el calendario puede enviarles por su cuenta el aviso de invitación, de cambio o de cancelación. En Google se controla con el parámetro `sendUpdates`.
- **En el proyecto:** al crear una reserva, el cliente recibe también la invitación de Google o de Outlook, además del email de la app. Al cancelar, recibe el aviso de evento cancelado.

### Videollamada en el evento (Meet y Teams)
Al crear el evento se le puede pedir al calendario que genere una sala de videollamada: Google Meet en Google, Microsoft Teams en Outlook. El link queda dentro del evento.
- **En el proyecto:** se activa en Configuración. El link se guarda en la reserva, se ve en el detalle del turno en la Agenda y viaja en los emails al cliente.

### `freebusy` (consulta de ocupado y libre)
Una pregunta que se le hace al calendario: "¿en qué momentos está ocupada esta persona?". Devuelve solo los horarios, sin título ni detalles.
- **En el proyecto:** así se calculan los horarios libres de la página pública, y así se dibujan los bloques "Ocupado" de otros calendarios en la Agenda.

### Azure / Microsoft Entra
Plataforma de Microsoft donde se registra la app para poder conectar Outlook.

### Resend
Servicio para enviar emails desde la app. En modo de prueba solo envía a una dirección autorizada hasta que se verifica un dominio.
- **En el proyecto:** manda las confirmaciones y avisos (`src/lib/notifications/email.ts`).

---

## 5. Seguridad

### Hash y bcrypt
Un **hash** convierte una contraseña en un texto del que no se puede volver atrás. **bcrypt** es el algoritmo que usamos, diseñado para ser lento a propósito.
- **En el proyecto:** `ADMIN_PASSWORD_HASH` guarda el hash de tu contraseña, no la contraseña.

### HMAC
Un hash que además usa una clave secreta. Sin la clave no se puede reproducir ni adivinar el resultado.
- **Parecido en Java:** `Mac.getInstance("HmacSHA256")`.
- **En el proyecto:** el límite de peticiones guarda un HMAC de la IP o del email, no el dato en claro, para no almacenar datos personales.

### JWT y cookie de sesión
Un **JWT** es un texto firmado que prueba quién sos. Se guarda en una **cookie** del navegador mientras la sesión está abierta.
- **En el proyecto:** la sesión del panel dura 8 horas (`src/lib/auth.ts`).

### Cifrado (AES-256-GCM)
Convierte un dato en otro ilegible que solo se puede recuperar con una clave.
- **En el proyecto:** protege los tokens de calendario guardados en la base.

### Inyección de HTML y XSS
Cuando un texto escrito por una persona se mete en una página o email y el navegador lo interpreta como código. La defensa es **escapar** el texto (convertir `<` en `&lt;`).
- **En el proyecto:** los nombres de clientes se escapan antes de ir a los emails (`esc()` en `email.ts`).

### Inyección de fórmulas en CSV
Si un nombre empieza con `=`, `+`, `-` o `@`, Excel puede ejecutarlo como una fórmula al abrir el archivo.
- **En el proyecto:** al exportar, se antepone un `'` a esos valores.

### Límite de peticiones (rate limiting)
Cortar a quien hace demasiadas peticiones en poco tiempo, para frenar abuso y fuerza bruta.
- **En el proyecto:** en preparación (punto 6 de la revisión de código).

### Cabeceras HTTP y cabeceras de seguridad
Las **cabeceras** son datos extra que acompañan cada respuesta del servidor y le dan instrucciones al navegador. Las de seguridad le piden que sea más estricto.
- **En el proyecto:** se definen en `next.config.mjs`. Por ejemplo, `X-Content-Type-Options` evita que el navegador adivine el tipo de un archivo, y `Strict-Transport-Security` obliga a usar HTTPS.

### Clickjacking
Un ataque donde una página maliciosa incrusta la tuya dentro de un marco invisible y engaña a la persona para que haga clic en un botón sin darse cuenta (por ejemplo, "Cancelar turno").
- **En el proyecto:** `X-Frame-Options: DENY` impide que el panel y la API se muestren dentro de otro sitio. La página pública de reservas sí se puede incrustar.

### SSRF (petición falsificada desde el servidor)
Un ataque donde se logra que el servidor haga una llamada a una dirección que el atacante elige, por ejemplo una interna que desde afuera no se ve.
- **En el proyecto:** la URL del webhook de Teams, que el servidor llama, solo se acepta si es `https` y de un dominio público (no una IP ni `localhost`).

### Caché por pedido (`cache` de React)
Guarda el resultado de una función durante un mismo pedido, para no repetir el trabajo cuando varias partes de la página la llaman.
- **En el proyecto:** buscar al profesional activo se hace una sola vez por página, aunque lo pidan el menú, la página y la API.

### Bot
Programa que usa una web de forma automática, sin una persona detrás. Algunos son útiles (los buscadores) y otros hacen abuso: llenar formularios con basura, probar contraseñas, mandar spam.
- **En el proyecto:** un bot podría reservar cientos de turnos falsos o hacer que la app mande emails masivos desde tu dominio.

### Dirección IP
Número que identifica desde dónde se conecta un dispositivo a internet, algo así como la "dirección postal" de la conexión.
- **En el proyecto:** el límite de peticiones cuenta cuántas veces pidió algo cada IP en un período de tiempo.

### Campo trampa (honeypot)
Un campo de formulario que las personas no ven (está oculto con CSS) pero que un bot sí encuentra y rellena, porque lee el código de la página. Si llega con contenido, el servidor sabe que fue un bot y descarta la petición.
- **Parecido en Java:** como un cepo: no hace falta detectar al bot, solo esperar a que caiga.
- **En el proyecto:** se agregará al formulario de reserva pública. Una persona nunca lo completa; un bot sí.

### Vulnerabilidad y `npm audit`
Una **vulnerabilidad** es una falla conocida en una librería. `npm audit` revisa las del proyecto contra una lista pública.
- **En el proyecto:** estamos en 0 vulnerabilidades desde la actualización a Next 15.5.27.

### `overrides` (en `package.json`)
Obliga a que una librería "de segunda mano" (que traen otras) use una versión nueva.
- **En el proyecto:** forzamos `uuid` y `postcss` a versiones sin fallas.

---

## 6. Problemas típicos de programación

### Condición de carrera (race condition)
Dos procesos hacen algo casi al mismo tiempo y el resultado depende de quién llega primero.
- **En el proyecto:** dos clientes reservando el mismo horario a la vez. Se resuelve con la restricción de exclusión de la base.

### TOCTOU ("revisar y después usar")
Un tipo de condición de carrera: se comprueba que algo está libre y, antes de usarlo, otro lo ocupa. Por eso la comprobación sola no alcanza; hay que bloquear en la base.

### Validar en el servidor
El navegador se puede manipular, así que **todo** lo que llega se vuelve a comprobar en el servidor.
- **En el proyecto:** el horario y la duración de un turno se calculan en el servidor, no se toman de lo que manda el navegador.

### Operación atómica
Una operación que se hace entera o no se hace, sin que otra pueda meterse a la mitad.
- **Parecido en Java:** `AtomicInteger.incrementAndGet()`.
- **En el proyecto:** el contador del límite de peticiones y la restricción contra turnos solapados dependen de eso, para que dos peticiones simultáneas no se pisen.

### Ventana fija (fixed window)
Forma de contar peticiones: el tiempo se divide en tramos iguales (por ejemplo, de 15 minutos) y se cuenta cuántas hizo cada visitante en el tramo actual. Al empezar un tramo nuevo, el contador vuelve a cero.
- **En el proyecto:** el login permite 10 intentos por IP cada 15 minutos. Es simple, aunque alguien podría hacer el máximo al final de un tramo y otra vez al principio del siguiente.

### Fail-open (dejar pasar si falla)
Decisión de qué hacer cuando un control de seguridad se rompe: dejar pasar a todos (fail-open) o bloquear a todos (fail-closed).
- **En el proyecto:** si la base falla al contar peticiones, se deja pasar y se registra el error, porque es peor dejar a todos sin poder reservar.

### Compensación (deshacer lo ya hecho)
Cuando un proceso tiene varios pasos en sistemas distintos (la base y el calendario de Google) y falla uno a la mitad, no se puede "volver atrás" todo de golpe. Entonces se hacen pasos inversos a mano para dejar todo como estaba.
- **Parecido en Java:** un `rollback` de transacción, pero escrito a mano porque abarca más de un sistema.
- **En el proyecto:** si falla algo después de crear el evento en Google, se borra ese evento y la reserva fallida; al reprogramar, se crea el evento nuevo antes de borrar el viejo.

### Evento huérfano
Un evento que quedó en el calendario sin ninguna reserva asociada en la base, por un fallo a mitad de camino. Ocupa tiempo en el calendario y no lo ve nadie en el panel.
- **En el proyecto:** las compensaciones existen justamente para evitar que queden.

### Bloqueo optimista (optimistic locking)
En vez de bloquear un dato mientras se trabaja, se actualiza solo si sigue como se lo leyó. Si otro proceso lo cambió antes, la actualización no se aplica y se avisa.
- **Parecido en Java:** `@Version` en JPA.
- **En el proyecto:** al cambiar el estado de un turno se exige que siga en el estado esperado (`updateMany` con condición). Así un doble clic no manda dos avisos al cliente, y dos pedidos que renuevan un token a la vez no se pisan.

### Caché
Guardar una respuesta por un rato para no repetir un trabajo costoso.

---

## 7. Formatos y estándares

### Zona horaria IANA
Nombre oficial de una zona, por ejemplo `America/Montevideo`. Es mejor que "GMT-3" porque considera cambios de horario de verano.

### E.164
Formato internacional de teléfono: `+` más código de país más número, sin espacios (`+59893333333`).
- **En el proyecto:** todos los teléfonos se normalizan a este formato antes de guardarse.

### `.ics`
Archivo de evento de calendario que se abre en Google Calendar, Outlook o Apple Calendar.
- **En el proyecto:** el botón "Agregar a mi calendario" de la página pública.

### CSV
Archivo de texto con valores separados por comas, que abre Excel.
- **En el proyecto:** el botón Exportar de Reservas y de Reportes.

### UTF-8 y BOM
**UTF-8** es la codificación de texto con acentos. El **BOM** es una marca al inicio del archivo que le avisa a Excel que use UTF-8.

---

## Historial

| Fecha | Qué se agregó |
| --- | --- |
| 2026-10-05 | Primera versión: piezas del proyecto, base de datos, publicación, servicios externos, seguridad, problemas típicos y formatos. |
| 2026-10-05 | Seguridad: bot, dirección IP, campo trampa (honeypot). |
| 2026-10-05 | Límite de peticiones: código de estado HTTP, upsert, HMAC, operación atómica, ventana fija y fail-open. |
| 2026-10-05 | Robustez: compensación, evento huérfano, bloqueo optimista y firma de un webhook. |
| 2026-10-05 | Cabeceras de seguridad, clickjacking, SSRF y caché por pedido. |
| 2026-10-05 | Ideas originales: IMAP y CalDAV, SSO y n8n. |
| 2026-10-05 | Videollamada y recordatorios: migración aditiva, cron, invitación del calendario, videollamada en el evento y freebusy. |
| 2026-10-05 | Reprogramar moviendo el mismo evento (patch). |
