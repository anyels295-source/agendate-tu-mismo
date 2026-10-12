# Informe QA exploratorio — Agéndate Tú Mismo

6 oct 2026 · rama `dev` (`014347e`) · app local `localhost:3002` contra la base de dev

## Resumen

Encontré **40 hallazgos**: 0 críticos, 8 altos, 19 medios y 13 bajos.

**Lo que resistió:**
- **Doble reserva:** 10 reservas simultáneas al mismo horario terminaron en 1 aceptada y 9 rechazadas.
- **Reglas de estado:** no se puede completar un turno futuro ni reactivar o reprogramar uno cancelado.
- **Validaciones de la reserva pública:** nombre, email, teléfono, horario de atención, pasado, anticipación mínima y máxima, y servicio ajeno.

**Lo más riesgoso para el negocio:**
1. **Recordatorios:** algunos clientes se quedan sin el del día anterior (#1, #2).
2. **Llamadas externas sin tiempo límite:** si Google o el email tardan, pueden quedar turnos y eventos "fantasma" (#3, #4).
3. **Formulario público abusable:** sirve para mandar invitaciones de calendario desde la cuenta real del profesional con un texto que elige el atacante (#5).

### Cómo se probó

| Técnica | Qué cubrió |
| --- | --- |
| Pruebas en vivo contra la API | 17 casos negativos de reserva pública, carrera de 10 envíos simultáneos, spam desde una IP, transiciones de estado, reprogramaciones inválidas, origen ajeno (CSRF), parámetros extremos, tiempos de carga de cada pantalla |
| Revisión de código (3 frentes) | Lógica de turnos y disponibilidad; seguridad y autenticación; notificaciones, calendarios y crons |
| Verificación cruzada | Revisé yo mismo en el código los hallazgos de seguridad #7 y #8 y el horario del cron (#1) |

**Etiquetas de evidencia:** **[Vivo]** quiere decir que lo reproduje contra la app. **[Código]** quiere decir que lo confirmé leyendo el código, sin reproducirlo.

**Fuera de esta ronda:**
- Pruebas visuales en el navegador del panel y de la página pública: no se pudieron hacer en esta sesión. Siguen valiendo los hallazgos de UX del informe del 2 de octubre que no se corrigieron.
- Recepción real de emails y WhatsApp.
- Flujos OAuth reales.
- Pérdida de conexión, doble clic en la interfaz y vista móvil.

**Datos de prueba:** creé 7 turnos `[QA] …` con email `qa@example.com` y quedaron todos cancelados. Sus eventos de Google se borraron al cancelar. Siguen en la base de dev hasta que se corra el script de limpieza.

---

## Prioridad 1: severidad Alta

### Hallazgo #1. Los turnos reservados para mañana después de las 09:00 no reciben recordatorio
- **Tipo:** Bug · **Severidad:** Alta · **Módulo:** Notificaciones / Recordatorios
- **Descripción:** el cron de recordatorios corre una sola vez por día, a las 12:00 UTC (09:00 en Montevideo), y solo busca los turnos de "mañana". Todo turno para mañana que se cree o se mueva después de esa hora queda sin recordatorio.
- **Pasos para reproducir:**
  1. Hoy a las 10:00, reservar un turno para mañana.
  2. Esperar a la corrida del cron de mañana a las 09:00.
- **Resultado esperado:** el cliente recibe el recordatorio antes del turno.
- **Resultado obtenido:** el cron de hoy ya corrió y el de mañana busca los turnos de pasado mañana, así que nunca se envía.
- **Impacto:** más ausencias justo en las reservas de último momento, que son las más frecuentes.
- **Probable causa:** `vercel.json` programa `"0 12 * * *"`, y `src/app/api/cron/reminders/route.ts:31-36` usa una ventana fija de "día siguiente".
- **Evidencia:** [Código] `vercel.json` y `reminders/route.ts:31-36`.
- **Recomendación:** al crear o reprogramar un turno para mañana cuando el cron ya pasó, enviar el recordatorio en el momento. La alternativa es un cron horario con ventana móvil, que exige el plan Pro de Vercel.

### Hallazgo #2. Reprogramar no reinicia el recordatorio
- **Tipo:** Bug · **Severidad:** Alta · **Módulo:** Reprogramación / Recordatorios
- **Descripción:** al reprogramar solo se cambian el inicio y el fin. `reminderSentAt` queda con su valor anterior.
- **Pasos para reproducir:**
  1. Turno para el 07/10. El 06/10 a las 09:00 se envía su recordatorio.
  2. El admin lo mueve al 15/10.
  3. El 14/10 corre el cron.
- **Resultado esperado:** recordatorio para el 15/10.
- **Resultado obtenido:** no se envía, porque el cron filtra `reminderSentAt: null`. El único recordatorio que recibió el cliente tenía la fecha vieja.
- **Impacto:** el cliente puede presentarse el día equivocado o no presentarse.
- **Probable causa:** `src/lib/booking.ts:453-457`.
- **Evidencia:** [Código] lo detectaron por separado dos de las revisiones.
- **Recomendación:** agregar `reminderSentAt: null` en el mismo `update` de la reprogramación. Es una línea.

### Hallazgo #3. Ninguna llamada externa tiene tiempo límite
- **Tipo:** Riesgo · **Severidad:** Alta · **Módulo:** Integraciones
- **Descripción:** estas llamadas no tienen timeout:
  - los `fetch` a Resend, WhatsApp, Teams y Graph;
  - googleapis.

  Tampoco hay `maxDuration`, y la reserva espera a que terminen los avisos antes de responder.
- **Pasos para reproducir:**
  1. Simular un webhook de Teams o un Graph que no responde.
  2. Crear una reserva.
- **Resultado esperado:** la reserva se crea y el aviso lento se registra como fallido.
- **Resultado obtenido:** Vercel corta la función y la compensación (`booking.ts:162-171`) nunca corre. Quedan un turno Pendiente que bloquea el horario, a veces un evento con el cliente invitado, y el cliente ve un error. Si reintenta, le responden "horario no disponible".
- **Impacto:** turnos fantasma, horarios bloqueados y clientes confundidos.
- **Probable causa:** falta `AbortSignal.timeout()` en `email.ts:57`, `whatsapp.ts:69`, `teams.ts:23` y `outlook.ts:112,196,204`.
- **Evidencia:** [Código]
- **Recomendación:**
  - Timeout de 5 a 8 s en cada llamada.
  - Mandar los avisos fuera de la respuesta, con `after()` de Next.
  - Un barrido periódico de turnos Pendientes sin evento.

### Hallazgo #4. Si falla la lectura del link de Meet, quedan un evento huérfano y la invitación enviada
- **Tipo:** Bug · **Severidad:** Alta · **Módulo:** Turnos / Google Calendar
- **Descripción:** el flujo es este:
  1. `events.insert`, con `sendUpdates:"all"`, crea el evento y le manda la invitación al cliente.
  2. Después se consulta el evento para leer el link de Meet.
  3. Si esa consulta falla, la compensación no conoce el id del evento y borra solo el turno de la base.
- **Pasos para reproducir:**
  1. Tener la videollamada activa.
  2. Que `events.get` devuelva un error de red o un 5xx mientras Meet genera el link.
- **Resultado esperado:** se deshace todo o el turno queda creado sin link.
- **Resultado obtenido:**
  - Para el cliente: tiene la invitación, recibe un error 500 y el turno no existe en la base.
  - En el calendario: el evento sigue ocupando el horario indefinidamente.
- **Impacto:** el cliente cree que tiene turno, pero el turno no existe.
- **Probable causa:** `google.ts:156-158`. `createdEventId` se asigna recién cuando la función termina (`booking.ts:116-145, 167`).
- **Evidencia:** [Código]
- **Recomendación:** atrapar el error del reintento y devolver `meetingUrl: null`, o devolver el id apenas termina el insert.

### Hallazgo #5. El formulario público se puede usar para spam o phishing con la cuenta real del profesional
- **Tipo:** Seguridad · **Severidad:** Alta · **Módulo:** Reserva pública
- **Descripción:** quien reserva elige el nombre y el email. Al instante se crea un evento en el Google del profesional, con ese nombre en el título, y se invita a ese email. La única protección es un límite de 8 reservas cada 15 min por IP. Los turnos Pendientes no vencen nunca.
- **Pasos para reproducir:**
  1. `POST /api/bookings` con `clientName: "Pagá tu deuda en sitio-falso.com"` y `clientEmail: <víctima>`.
  2. Repetir desde varias IP.
- **Resultado esperado:** una reserva anónima no dispara invitaciones con contenido arbitrario y no puede bloquear la agenda.
- **Resultado obtenido:**
  - En vivo: creé reservas con nombres arbitrarios y desde una misma IP se aceptaron reservas en serie.
  - En el código: cada reserva invita al email indicado.
- **Impacto:**
  - Phishing creíble, enviado desde la cuenta real del profesional.
  - Daño a la reputación del dominio.
  - Agenda bloqueada por turnos que nunca se confirman.
- **Probable causa:** no se verifica el email antes de invitar. Ver `src/app/api/bookings/route.ts:28-59` y `google.ts:119`.
- **Evidencia:** [Vivo] + [Código]
- **Recomendación:**
  - Agregar CAPTCHA (Turnstile).
  - Invitar al calendario recién al confirmar.
  - Limitar también por email.
  - Hacer vencer los Pendientes sin confirmar después de N horas.

### Hallazgo #6. Un calendario revocado deja de bloquear horarios sin avisar a nadie
- **Tipo:** Riesgo · **Severidad:** Alta · **Módulo:** Calendarios / Disponibilidad
- **Descripción:** cuando Google o Microsoft responde `invalid_grant`, la conexión se marca inactiva. Desde ese momento sus eventos ya no cuentan como ocupados.
- **Pasos para reproducir:**
  1. Tener conectados dos calendarios.
  2. Revocar el acceso a uno desde la cuenta de Google o Microsoft.
- **Resultado esperado:** aviso al profesional. La página pública deja de ofrecer horarios o lo indica.
- **Resultado obtenido:** se ofrecen horarios que en el calendario revocado están ocupados. Solo se nota si alguien entra a Calendarios.
- **Impacto:** doble reserva real con los compromisos personales del profesional.
- **Probable causa:** `tokenManager.ts:56-61`, y `booking.ts:50` filtra `isActive`.
- **Evidencia:** [Código]
- **Recomendación:** mandar un email al profesional y mostrar un banner en el Panel cuando una conexión pasa a inactiva.

### Hallazgo #7. El `state` de OAuth sirve como cookie de sesión de admin
- **Tipo:** Seguridad · **Severidad:** Alta · **Módulo:** Autenticación
- **Descripción:** el `state` de OAuth y la sesión de admin se firman con el mismo `AUTH_SECRET`. `getAdminSession` acepta cualquier JWT válido y no verifica `role` ni `email`.
- **Pasos para reproducir:**
  1. Copiar el `state` de la URL de autorización de Google. Aparece en el historial del navegador y en los logs.
  2. Enviarlo como `Cookie: agendate_admin_session=<state>` a `/api/admin/professionals`.
- **Resultado esperado:** 401.
- **Resultado obtenido:** 200. Da acceso completo al panel durante 10 minutos.
- **Impacto:** toma de control del panel si se filtra un `state`.
- **Probable causa:** `src/lib/oauthState.ts:16-21` y `src/lib/auth.ts:63-65`.
- **Evidencia:** [Código], verificado por mí en los dos archivos.
- **Recomendación:** exigir `role === "admin"` y que `email` coincida con `ADMIN_EMAIL` en `getAdminSession`, y separar las firmas con un `audience` distinto. Son pocas líneas.

### Hallazgo #8. Inyección de HTML (XSS) en la ventana emergente de OAuth
- **Tipo:** Seguridad · **Severidad:** Alta · **Módulo:** Calendarios (OAuth)
- **Descripción:** el parámetro `error` de la URL del callback se inserta sin escapar en el HTML de la ventana que se cierra.
- **Pasos para reproducir:** `/api/auth/google/callback?state=<state popup válido>&error=<img src=x onerror=...>`
- **Resultado esperado:** el texto se muestra escapado.
- **Resultado obtenido:** el script se ejecuta en el mismo origen que el panel y puede llamar a la API de admin con la sesión del usuario.
- **Impacto:** robo de datos de clientes o acciones en nombre del admin. Requiere un `state` válido, lo que baja la probabilidad.
- **Probable causa:** `src/lib/oauthPopup.ts:31` interpola `${message}`. Lo mismo ocurre en `google/callback/route.ts:20` y `outlook/callback/route.ts:20`.
- **Evidencia:** [Código], verificado por mí.
- **Recomendación:** escapar `message`, `title` y `provider`, no reflejar `error` y agregar CSP.

---

## Prioridad 2: severidad Media

### Hallazgo #9. Se aceptan turnos a horas fuera de la grilla, y eso corre todos los horarios del día
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Disponibilidad
- **Descripción:** la API acepta cualquier minuto de inicio, aunque la página pública solo ofrece múltiplos de 15. Los horarios libres se calculan a partir del final de cada bloque ocupado, así que un turno a las 09:07 desplaza toda la grilla del día.
- **Pasos para reproducir:**
  1. `POST /api/bookings` con `startISO 2026-10-13T09:07-03:00`.
  2. `GET /api/availability?from=2026-10-13`.
- **Resultado esperado:** 400 por "hora no válida" en el paso 1, y una grilla de 09:00, 09:15… en el paso 2.
- **Resultado obtenido:**
  - Paso 1: 200, turno creado.
  - Paso 2: horarios a las 09:37, 09:52, 10:07, 10:22…; el de las 09:00 desapareció.
  - Lo mismo pasa al reprogramar desde el panel a las 10:11: 200.
- **Impacto:** horarios raros para los clientes y menos turnos disponibles por día. Un evento externo que termina a las 10:10 provoca el mismo efecto.
- **Probable causa:** `checkSlotAllowed` no valida la grilla, y en `availability.ts:199-208` el cursor arranca en el inicio del hueco libre.
- **Evidencia:** [Vivo]
- **Recomendación:** validar que el inicio caiga en múltiplos de 15 y alinear el cursor a la grilla (redondear hacia arriba).

### Hallazgo #10. El colchón entre turnos no se aplica en la verificación final
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Disponibilidad
- **Descripción:** la lista de horarios aplica el colchón, pero la verificación al reservar consulta solo [inicio, fin] en Google y en la base.
- **Pasos para reproducir:**
  1. Colchón de 15 min y un evento de 9:00 a 10:00.
  2. `POST` con inicio a las 10:00.
- **Resultado esperado:** 409.
- **Resultado obtenido:** se acepta, pegado al evento.
- **Impacto:** turnos sin el margen configurado.
- **Probable causa:** `availability.ts:229-251`.
- **Evidencia:** [Código]
- **Recomendación:** consultar [inicio − colchón, fin + colchón].

### Hallazgo #11. La API deja reprogramar y cancelar turnos Completados o Ausentes
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Turnos
- **Descripción:** la interfaz oculta esas opciones, pero el servidor solo bloquea los turnos Cancelados.
- **Pasos para reproducir:** sobre un turno Completado de ayer, hacer `POST /reschedule` a mañana o `PATCH {status:"CANCELLED"}`.
- **Resultado esperado:** 400.
- **Resultado obtenido:**
  - Al reprogramar: queda "Completado" con fecha futura y se avisa al cliente.
  - Al cancelar: se borra el evento histórico y el cliente recibe "cancelado".
- **Impacto:** estados imposibles, avisos absurdos y métricas que cambian.
- **Probable causa:** `booking.ts:412` y `booking.ts:346`.
- **Evidencia:** [Código]
- **Recomendación:** permitir reprogramar y cancelar solo desde Pendiente o Confirmado.

### Hallazgo #12. El panel acepta turnos en el año 9999
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Turnos (panel)
- **Descripción:** para el admin solo se valida que la fecha no sea pasada.
- **Pasos para reproducir:** `POST /api/admin/bookings` con `startISO 9999-12-31T10:00-03:00`.
- **Resultado esperado:** 400.
- **Resultado obtenido:** 200, turno Confirmado y evento creado en Google Calendar para el año 9999.
- **Impacto:** un error de tipeo en la fecha (lo mismo que pasaba con `82026` en la Agenda) crea un turno y un evento basura.
- **Probable causa:** `availability.ts:151-153`.
- **Evidencia:** [Vivo] Lo cancelé después de la prueba.
- **Recomendación:** poner un tope, por ejemplo de 2 años.

### Hallazgo #13. Un turno rechazado sigue ocupando el horario y recibe recordatorio
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Respuesta del invitado
- **Descripción:** "Rechazado" solo se pinta en rojo en la Agenda. En la base el turno sigue Pendiente.
- **Pasos para reproducir:**
  1. El cliente rechaza la invitación desde Google.
  2. Esperar al día anterior al turno.
- **Resultado esperado:** el horario se libera, o al menos no se manda recordatorio.
- **Resultado obtenido:** el cliente recibe "te recordamos tu turno" y el horario sigue bloqueado.
- **Impacto:** el cliente ve un mensaje contradictorio y se pierde un horario vendible.
- **Probable causa:** `agenda/page.tsx:88-93` no persiste la respuesta, y `reminders/route.ts:35` toma Pendientes y Confirmados.
- **Evidencia:** [Código]
- **Recomendación:** guardar la respuesta del invitado en la base y excluirla del recordatorio.

### Hallazgo #14. Las respuestas de los invitados solo se sincronizan al abrir la Agenda
- **Tipo:** Inconsistencia · **Severidad:** Media · **Módulo:** Respuesta del invitado
- **Descripción:** la sincronización se ejecuta solo cuando se carga la Agenda, con estas limitaciones:
  - cubre solo la semana visible;
  - tiene un tope de 25 turnos;
  - se corta a los 6 s.
- **Pasos para reproducir:**
  1. El cliente acepta la invitación.
  2. Revisar el Panel o el resumen diario sin abrir la Agenda.
- **Resultado esperado:** el turno figura Confirmado.
- **Resultado obtenido:** sigue Pendiente en el Panel, en Reservas, en los reportes y en el resumen.
- **Impacto:** cada módulo muestra un estado distinto. Es un riesgo para la demo si se muestra el Panel antes que la Agenda.
- **Probable causa:** `agenda/page.tsx:83-93` e `invitations.ts:26`.
- **Evidencia:** [Código]
- **Recomendación:** sincronizar en el cron diario. Más adelante, usar webhooks (ya está en la lista de pendientes).

### Hallazgo #15. El último día de la anticipación máxima muestra horarios que después se rechazan
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Disponibilidad
- **Descripción:** la lista incluye todo el último día, pero al reservar se compara contra "ahora + N días" exacto.
- **Pasos para reproducir:**
  1. Con `maxAdvanceDays` = 30, entrar hoy a las 10:00.
  2. Elegir un horario del día 30 a las 15:00.
- **Resultado esperado:** que no se muestre, o que se acepte.
- **Resultado obtenido:** se muestra y al confirmar responde 409 "ya no está disponible".
- **Impacto:** frustración del cliente.
- **Probable causa:** `availability/route.ts:65-67` frente a `availability.ts:150`.
- **Evidencia:** [Código]
- **Recomendación:** usar el mismo criterio en los dos lugares.

### Hallazgo #16. El modal de Reprogramar calcula los horarios con la duración por defecto
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Reprogramación
- **Descripción:** el modal no envía el servicio ni la duración, pero el servidor conserva la duración original del turno.
- **Pasos para reproducir:**
  1. Tener un turno de un servicio de 60 min, con 30 min por defecto y atención hasta las 18:00.
  2. Elegir las 17:30.
- **Resultado esperado:** que no se ofrezcan las 17:30.
- **Resultado obtenido:** se ofrecen, y al confirmar falla con "fuera del horario de atención" o con 409.
- **Impacto:** reprogramaciones fallidas. Hoy los dos servicios duran 30 min, así que no se nota.
- **Probable causa:** `RescheduleModal.tsx:53`.
- **Evidencia:** [Código]
- **Recomendación:** pasar `serviceId` o la duración del turno.

### Hallazgo #17. Una reprogramación puede quedar a medias si falla la recreación del evento
- **Tipo:** Inconsistencia · **Severidad:** Media · **Módulo:** Reprogramación
- **Descripción:** el horario nuevo se guarda antes de mover el evento. Si el evento ya no existía y crear el nuevo falla, el cambio no se revierte.
- **Pasos para reproducir:**
  1. Borrar a mano el evento en Google.
  2. Reprogramar con fallo de red.
- **Resultado esperado:** se revierte el cambio o queda marcado "sin evento".
- **Resultado obtenido:**
  - La base tiene el horario nuevo y un id de evento que ya no existe.
  - No hay evento en el calendario.
  - El cliente no recibe aviso.
  - El admin ve un error 500.
- **Impacto:** el turno existe en la app pero no en el calendario.
- **Probable causa:** `booking.ts:453-503`.
- **Evidencia:** [Código]
- **Recomendación:** revertir el horario también en esa rama.

### Hallazgo #18. Cancelar o reprogramar falla con dos cuentas del mismo proveedor
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Calendarios
- **Descripción:** el turno no guarda en qué conexión se creó. Al cancelar o mover, se usa la primera conexión de ese proveedor.
- **Pasos para reproducir:**
  1. Conectar dos cuentas de Google. El turno se crea en la B.
  2. El cliente cancela.
- **Resultado esperado:** se borra el evento en la cuenta B.
- **Resultado obtenido:** se intenta en la A, el 404 se toma como "ya borrado" y el evento sigue en B con el cliente invitado.
- **Impacto:** eventos huérfanos. Hoy no pasa porque hay una sola cuenta de Google.
- **Probable causa:** `booking.ts:239,445,248`.
- **Evidencia:** [Código]
- **Recomendación:** guardar `calendarConnectionId` en el turno.

### Hallazgo #19. Un recordatorio que falla no se reintenta nunca
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Recordatorios
- **Descripción:** el turno se marca como "recordado" antes del envío. Si el envío falla, queda marcado igual.
- **Pasos para reproducir:**
  1. Que Resend responda 429 o 5xx durante el cron.
- **Resultado esperado:** reintento en la próxima corrida.
- **Resultado obtenido:** el recordatorio se pierde.
- **Impacto:** recordatorios faltantes que nadie nota.
- **Probable causa:** `reminders/route.ts:45-48`.
- **Evidencia:** [Código]
- **Recomendación:** si el envío falla, volver a poner `reminderSentAt` en null o llevar un contador de intentos.

### Hallazgo #20. El resumen diario no deja registro y va a otro email
- **Tipo:** Bug · **Severidad:** Media · **Módulo:** Notificaciones
- **Descripción:** el resumen diario no se registra en ningún lado y se manda a `professional.email`, no al "Email para avisos". Con Resend en modo prueba falla todos los días sin dejar rastro. Además, no tiene protección contra un envío doble.
- **Pasos para reproducir:**
  1. Configurar un email de profesional distinto del de la cuenta de Resend.
  2. Esperar a las 11:00 UTC.
- **Resultado esperado:** el resumen llega al email para avisos, o el fallo se ve en el Panel.
- **Resultado obtenido:** no llega y no aparece ningún error.
- **Impacto:** una función "entregada" que en realidad no funciona.
- **Probable causa:** `daily-summary/route.ts:118-139` y `NotificationLog.bookingId`, que es obligatorio.
- **Evidencia:** [Código]
- **Recomendación:** enviarlo al email para avisos y registrar el resultado.

### Hallazgo #21. WhatsApp muestra "enviado" sin confirmar la entrega
- **Tipo:** Riesgo · **Severidad:** Media · **Módulo:** Notificaciones
- **Descripción:** se descarta el id del mensaje que devuelve Meta, y el webhook ignora los avisos de estado (hay un TODO).
- **Pasos para reproducir:**
  1. Reservar con un número inexistente.
- **Resultado esperado:** el aviso figura como fallido.
- **Resultado obtenido:** el Panel lo muestra como enviado.
- **Impacto:** el profesional cree que avisó al cliente cuando no fue así.
- **Probable causa:** `index.ts:39-48` y `webhooks/whatsapp/route.ts:47-50`.
- **Evidencia:** [Código]
- **Recomendación:** guardar el id del mensaje y procesar los avisos de estado (`statuses`).

### Hallazgo #22. Al reprogramar, WhatsApp manda la plantilla "turno confirmado" a un turno Pendiente
- **Tipo:** Inconsistencia · **Severidad:** Media · **Módulo:** Notificaciones
- **Descripción:** la reprogramación no tiene en cuenta el estado del turno. La confirmación sí omite WhatsApp para los Pendientes.
- **Pasos para reproducir:**
  1. Reprogramar un turno Pendiente de un cliente con WhatsApp.
- **Resultado esperado:** sin WhatsApp, o con una plantilla de reprogramación.
- **Resultado obtenido:** el cliente recibe "turno confirmado".
- **Impacto:** el cliente cree que su turno está confirmado.
- **Probable causa:** `index.ts:148-158`.
- **Evidencia:** [Código]
- **Recomendación:** omitir WhatsApp si el turno está Pendiente.

### Hallazgo #23. Un fallo de cualquier calendario deja sin horarios a toda la página pública
- **Tipo:** Riesgo · **Severidad:** Media · **Módulo:** Disponibilidad
- **Descripción:** se usa `Promise.all`. Un 401 o 5xx de un solo proveedor hace fallar toda la consulta.
- **Pasos para reproducir:**
  1. Que Google devuelva un 5xx, o revocar el token durante la hora en que el token de acceso sigue vigente.
- **Resultado esperado:** se informa el fallo parcial con una política definida.
- **Resultado obtenido:** la página pública queda sin horarios.
- **Impacto:** no se pueden tomar reservas.
- **Probable causa:** `availability.ts:180-182`.
- **Evidencia:** [Código]
- **Recomendación:** tratar el 401 como token vencido y decidir una política explícita para los fallos parciales.

### Hallazgo #24. La página pública solo muestra 10 días
- **Tipo:** Inconsistencia · **Severidad:** Media · **Módulo:** Reserva pública
- **Descripción:** el widget pide 10 días fijos y no deja navegar más allá, aunque la anticipación máxima configurada sea mayor.
- **Pasos para reproducir:**
  1. Configurar la anticipación máxima en 30 días.
  2. Intentar reservar el día 20.
- **Resultado esperado:** se puede.
- **Resultado obtenido:** no aparece.
- **Impacto:** la configuración no tiene efecto real.
- **Probable causa:** `BookingWidget.tsx:76`, y el servidor topa en 14 días.
- **Evidencia:** [Código]
- **Recomendación:** agregar navegación por semanas con el parámetro `from`.

### Hallazgo #25. No existen los roles Recepcionista, Operador ni Cliente
- **Tipo:** Riesgo · **Severidad:** Media · **Módulo:** Usuarios y roles
- **Descripción:** hay un único login de admin, definido en variables de entorno, y nadie lee el campo `role` del JWT. Los profesionales del equipo no tienen login. El "cliente" no tiene cuenta: solo un link de cancelación.
- **Pasos para reproducir:** no aplica; es el diseño actual.
- **Resultado esperado según el brief:** permisos por rol.
- **Resultado obtenido:** todo o nada. No pude probar escalación de privilegios porque no hay privilegios intermedios. Sí verifiqué que los 13 endpoints de admin exigen sesión, que no hay acceso a datos ajenos (IDOR) y que los PATCH solo aceptan campos permitidos.
- **Impacto:** no se puede dar acceso a una recepcionista sin darle control total.
- **Probable causa:** decisión del MVP (`src/lib/auth.ts:5-13`).
- **Evidencia:** [Código]
- **Recomendación:** ya figura entre los pendientes posteriores a la demo. Conviene aclararlo en la demo si alguien pregunta.

### Hallazgo #26. Rendimiento: el Panel y la Agenda tardan entre 4 y 5 s en cargar en frío
- **Tipo:** Performance · **Severidad:** Media · **Módulo:** Panel / Agenda
- **Descripción:** tiempos medidos en local, en modo desarrollo:

  | Pantalla | Primera carga | Segunda carga |
  | --- | --- | --- |
  | Panel | 4,2 s | — |
  | Agenda | 4,8 s | 0,9 s |
  | Reservas | 1,9 s | 0,6 s |

  La Agenda consulta Google en cada carga (eventos de otros calendarios y respuestas de invitados, con un tope de 6 s).
- **Pasos para reproducir:**
  1. Abrir la Agenda después de un rato sin usarla.
- **Resultado esperado:** menos de 2 s.
- **Resultado obtenido:** 4,8 s. Hay que medir en producción, porque el modo desarrollo compila en la primera carga.
- **Impacto:** se nota en la demo.
- **Probable causa:** llamadas a Google en el render de la página.
- **Evidencia:** [Vivo] (en local)
- **Recomendación:** antes de grabar, abrir una vez cada pantalla para calentarla. Más adelante, cachear las consultas a Google.

### Hallazgo #27. No hay protección contra el reintento del cliente (idempotencia)
- **Tipo:** Riesgo · **Severidad:** Media · **Módulo:** Reserva pública
- **Descripción:** si la red se corta después de que el servidor creó la reserva, el cliente reintenta y recibe 409 sobre su propio horario.
- **Pasos para reproducir:**
  1. Cortar la conexión justo al confirmar la reserva.
  2. Reintentar.
- **Resultado esperado:** "ya tenés este turno".
- **Resultado obtenido:** "horario no disponible". El cliente elige otro horario y termina con dos reservas.
- **Impacto:** reservas duplicadas de una misma persona.
- **Probable causa:** no se usa clave de idempotencia ni se detecta el mismo email y horario.
- **Evidencia:** [Código]
- **Recomendación:** si ya existe una reserva con el mismo email, profesional y horario, devolverla en lugar de responder 409.

---

## Prioridad 3: severidad Baja

| # | Tipo | Módulo | Hallazgo | Evidencia | Recomendación |
| --- | --- | --- | --- | --- | --- |
| 28 | Bug | API disponibilidad | `/api/availability?days=abc` responde **500** | [Vivo] | Validar `days` como entero de 1 a 14 |
| 29 | UX | Reserva pública | El servidor tiene mensajes claros ("Falta la anticipación mínima…", "fuera del horario de atención"), pero la reserva pública responde siempre "El horario elegido ya no está disponible": para el pasado, el sábado, las 03:00, 5 minutos de duración, el año 9999 y la anticipación mínima. El panel sí muestra los mensajes claros | [Vivo] | Devolver el mensaje específico |
| 30 | UX | API | Hay mensajes en inglés: un JSON roto devuelve "Expected object, received null" y un estado inválido devuelve "Invalid enum value. Expected 'PENDING' \| …" | [Vivo] | Mensajes propios en español |
| 31 | Seguridad | Login | Hacer 21 intentos fallidos con el email del admin lo bloquea 1 hora, y se puede repetir. El email real del admin está en `.env.example` | [Código] | Límite por email más IP; sacar el email de `.env.example` |
| 32 | Seguridad | Sesión | El logout solo borra la cookie: un token robado vale 8 h | [Código] `auth.ts:54-57` | Versión de sesión en la base |
| 33 | Seguridad | API admin | Un `PATCH` con `Origin: https://evil.example` y `text/plain` se aceptó (canceló un turno). Hoy lo frena `SameSite=Lax` en los navegadores | [Vivo] | Verificar `Origin` y exigir `application/json` |
| 34 | Seguridad | Crons | El secreto del cron se compara con `!==`, no en tiempo constante | [Código] | `timingSafeEqual` |
| 35 | Seguridad | Avisos Teams | La URL del webhook valida solo la forma del dominio: `https://127.0.0.1.nip.io` pasa (SSRF, solo un admin puede configurarlo) | [Código] | Permitir solo `*.webhook.office.com` / `*.logic.azure.com` |
| 36 | Seguridad | Global | Falta `Content-Security-Policy`. `X-Frame-Options` está solo en `/admin` y `/api`, así que `/cancelar/[token]` se puede incrustar en otro sitio | [Código] `next.config.mjs` | CSP con `frame-ancestors` |
| 37 | UX | Cancelación | `/cancelar/<token inválido>` responde 200 y la página muestra un error genérico en lugar de "enlace no válido". No muestra qué turno se cancela. Se puede cancelar un minuto antes del turno | [Vivo] + [Código] | Mostrar el turno y el motivo; definir una antelación mínima para cancelar |
| 38 | Inconsistencia | Turnos | Se puede confirmar un Pendiente ya pasado, y se le manda "confirmado" al cliente. "Deshacer" una confirmación vuelve el turno a Pendiente sin avisar al cliente, que ya recibió el email | [Código] `booking.ts:327-343`, `BookingsTable.tsx:174` | No avisar en turnos pasados; no ofrecer deshacer si ya se avisó |
| 39 | Inconsistencia | Reserva pública | Sin `serviceId`, se reserva el servicio por defecto "Consulta", que no está en el catálogo | [Código] `booking.ts:59-74` | Exigir el servicio si hay servicios activos |
| 40 | Mejora | Notificaciones | No existe SMS. El `.ics` descargable usa un UID que no está atado al turno, lo que puede duplicar el evento y no se actualiza al reprogramar. El historial de avisos no guarda el tipo ni el destinatario | [Código] | Para después de la demo |

---

## Funcionó correctamente (validado en vivo)

| Prueba | Resultado |
| --- | --- |
| 10 reservas simultáneas al mismo horario | 1 aceptada y 9 con 409. La restricción de la base funciona |
| Reserva pública en el pasado, en sábado, a las 03:00, en el año 9999, con 5 min, con 8 h, a más de 30 días o dentro del aviso mínimo | Rechazadas (aunque con un mensaje genérico, ver #29) |
| Fin antes del inicio, fecha basura, email `a@b`, nombre en blanco, teléfono con letras, servicio inexistente | 400 con mensaje claro |
| Marcar Completado o Ausente un turno futuro | 400 |
| Reactivar o reprogramar un turno cancelado | 400 |
| Reprogramar encima de otro turno | 409 |
| Reprogramar con 4 h de duración | El servidor conserva la duración original (30 min) |
| Endpoints de admin sin sesión | 401 |
| Slug inexistente | 404 |
| Búsqueda con `'"<script>` y rango de reportes invertido | Sin error |

## Qué conviene arreglar antes de la demo del jueves

Son cambios chicos y de bajo riesgo:
1. **#2:** reiniciar el recordatorio al reprogramar. Es una línea.
2. **#7 y #8:** validar `role` y `email` en la sesión y escapar el HTML de la ventana emergente. Son pocas líneas.
3. **#9:** rechazar horas fuera de la grilla y alinear los horarios.
4. **#28 y #30:** mensajes claros y en español.

**Para la demo en sí:**
- No mostrar el Panel antes que la Agenda (#14).
- Calentar las pantallas antes de grabar (#26).

Lo demás (#1, #3, #5, #6) necesita diseño y conviene dejarlo para después de la demo.
