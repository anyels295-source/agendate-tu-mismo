# Cumplimiento de las ideas originales

Comparación entre lo que está construido hoy y las dos ideas de InvenIA que dieron origen al proyecto:

- **68ZG6 - Agendate tú mismo** (pequeños emprendedores de servicios).
- **5C2F5 - Agente AgendaFácil** (agente de reservas sobre varios calendarios, con IA).

Estado al 2026-10-05. Las categorías son: **Cumple**, **Parcial** y **Falta**.

---

## Idea 68ZG6 - Agendate tú mismo

Resumen: una herramienta web, compartida por un link de WhatsApp, donde el emprendedor define sus horarios de la semana y sus clientes se agendan viendo solo los espacios libres, con citas extra, reportes y alertas de cambios.

| Lo que dice la idea | Estado | Cómo se cumple hoy | Brecha |
| --- | --- | --- | --- |
| Herramienta web compartida por un link de WhatsApp | Cumple | Página pública `/reservar/<link>`, con los botones "Compartir por WhatsApp" y "Copiar link" | Falta un dominio propio (hoy usa `agendate-tu-mismo.vercel.app`) |
| El emprendedor ingresa los horarios disponibles de la semana | Cumple | Configuración, Horario de atención, con varios tramos por día | No se pueden bloquear días puntuales (feriados, vacaciones) desde la app; se resuelve creando un evento en el calendario conectado |
| Los clientes se agendan directamente, viendo solo los espacios libres | Cumple | La página pública ofrece solo horarios libres: cruza el horario de atención, los calendarios conectados y los turnos ya reservados, con elección de servicio y zona horaria | Ninguna |
| El emprendedor agrega citas extra según surjan | Cumple | "Nueva reserva" desde Reservas y desde la Agenda, a elección Pendiente o Confirmada | Ninguna |
| Reportes de compromisos por día, semana, etc. | Cumple | Agenda semanal, Panel (semana, mes, ocupación), Reportes (hoy, semana, mes, rango, exportar a CSV) y resumen diario por email | Gráficos más ricos |
| Alertas si hay modificaciones en horarios preagendados | Parcial | Email al cliente al reprogramar o cancelar, aviso al profesional (email y Teams) y aviso en el Panel si algo no se pudo enviar | Los emails solo llegan a la dirección autorizada hasta verificar un dominio en Resend. WhatsApp solo manda confirmaciones: falta una plantilla aprobada para cambios y cancelaciones |
| Facilidad de uso para cualquier persona, incluso adultos mayores | Cumple en lo básico | Tres pasos (elegir, datos, listo), botones grandes, textos en español, WhatsApp opcional, etiquetas y teclado accesibles | Falta probarlo con usuarios reales |
| Registro y configuración mínimos para el emprendedor | Falta | Hoy hay un único administrador definido por variables de entorno | Alta propia del emprendedor, con su email y contraseña |
| Código único por emprendedor, con enlaces personalizados | Cumple | Link único y editable por profesional | Ninguna |
| Dominio y hosting estables y rápidos | Parcial | Vercel y Neon funcionando | Dominio propio |
| Prototipo funcional para probar usabilidad con usuarios reales | En curso | QA de punta a punta hecho y corregido | Pruebas con emprendedores reales |

**Lectura:** el núcleo de esta idea está cubierto. Las brechas son el registro propio de emprendedores, el dominio propio y que las alertas lleguen a cualquier destinatario.

---

## Idea 5C2F5 - Agente AgendaFácil

Resumen: un agente de reservas que sincroniza varios calendarios (Google, Microsoft 365, IMAP/CalDAV), agenda según la disponibilidad real, envía resúmenes y alertas, integra salas virtuales y usa IA para coordinar reuniones. El enfoque técnico propuesto (n8n con OpenAI) es distinto del que se usó acá (aplicación web propia), así que se compara el resultado, no la herramienta.

| Lo que dice la idea | Estado | Cómo se cumple hoy | Brecha |
| --- | --- | --- | --- |
| Varios proveedores de calendario (Google, Microsoft 365, IMAP/CalDAV) | Parcial | Google funcionando. Outlook implementado y pendiente del consentimiento del administrador de la empresa. Se pueden conectar varias cuentas | Falta IMAP/CalDAV. Solo se usa el calendario principal de cada cuenta |
| Reservar según la disponibilidad de todos los calendarios sincronizados | Cumple | Cruza en vivo los bloques ocupados de todas las conexiones activas, el horario y los turnos propios | Ninguna |
| Invitar a una cita y que quede como evento sincronizado | Parcial | Se crea el evento en el calendario real con el cliente como invitado | Google no envía la invitación del calendario (falta activar `sendUpdates`; decisión pendiente) |
| Elegir desde el correo a quién invitar | Falta | No existe | Requiere integración con el correo y un agente de IA |
| Calendario centralizado, visible también desde el móvil | Parcial | Agenda semanal que se adapta al celular | Muestra solo los turnos de la app, no los eventos de los otros calendarios |
| Resúmenes diarios o semanales (email, móvil, Teams o Slack) | Parcial | Resumen diario por email con datos de la semana. Avisos por Teams | No hay Slack ni notificaciones al móvil. El envío corre una vez por día |
| Confirmaciones | Cumple | Emails de reserva pendiente, confirmación, cambio y cancelación | WhatsApp requiere plantillas aprobadas |
| Alertas proactivas: conflictos | Cumple | La base de datos impide la doble reserva aunque dos personas reserven a la vez | Ninguna |
| Alertas proactivas: buffers insuficientes | Parcial | El "colchón entre turnos" ahora se aplica en la disponibilidad (se corrigió el 2026-10-05: antes no tenía efecto) | No hay alertas que avisen de colchones o traslados insuficientes |
| Auto-sincronización: un cambio en cualquier calendario se refleja en todos y notifica | Parcial | La disponibilidad se recalcula en vivo contra los calendarios: si se crea un evento afuera, el horario desaparece de la página pública | No hay avisos cuando alguien cambia o rechaza un evento (ítem 8 pendiente) |
| Recordatorios de citas | Falta | Solo hay confirmaciones | Recordatorio previo al turno; se puede hacer con el envío diario |
| Enlaces de reserva externos (estilo Cal.com) | Cumple | Página pública por profesional | Ninguna |
| Salas virtuales (Zoom, Meet, Teams) con link automático | Falta | No existe | Agregar el link de Google Meet o Teams al crear el evento |
| IA generativa: interpretar correos, armar agendas, redactar mensajes, sugerir salas | Falta | No existe | Fase posterior |
| Panel de análisis y recomendaciones | Parcial | Panel y Reportes con ocupación, turnos y cancelaciones | Recomendaciones automáticas con IA |
| Piloto de equipo (5 a 10 personas) con permisos, SSO y niveles de visibilidad | Parcial | Varios profesionales bajo una cuenta, cada uno con su calendario, servicios, horario y link | No hay usuarios por persona, roles ni SSO |
| Disponibilidad de colegas internos | Falta | Cada profesional se gestiona por separado | Buscar un horario común entre varias personas |
| Costo mínimo | Cumple | Vercel y Neon en planes gratuitos | Ninguna |

**Lectura:** el motor central (reservar según la disponibilidad real de varios calendarios, sin dobles reservas) está cubierto. Lo que falta son las capas de inteligencia (IA, correo, recomendaciones), las salas virtuales y los recordatorios.

---

## Qué se podría reforzar antes de la demostración

Ordenado por aporte a las ideas y esfuerzo estimado. Ninguno cambia lo que ya funciona.

| Mejora | Idea que cubre | Esfuerzo | Riesgo |
| --- | --- | --- | --- |
| Link de videollamada automático (Google Meet; Teams para Outlook) | 5C2F5: salas virtuales | Medio | Bajo |
| Recordatorio por email el día anterior al turno | 5C2F5: recordatorios | Medio | Bajo |
| Mostrar en la Agenda los eventos de los demás calendarios, como bloques ocupados | 5C2F5: calendario centralizado | Medio | Bajo |
| Invitación real del calendario al cliente (`sendUpdates`) | 5C2F5: evento sincronizado | Bajo | Bajo, pero cambia lo que recibe el cliente |
| Verificar dominio en Resend, para que los emails lleguen a cualquiera | 68ZG6: alertas | Bajo (lo hace el administrador del dominio) | Ninguno |
| Bloquear días puntuales desde la app | 68ZG6: horarios de la semana | Medio, con migración | Medio |

## Qué queda para después de la demostración

- Registro propio de emprendedores y usuarios por persona, con roles y SSO.
- IMAP/CalDAV y varios calendarios por cuenta.
- Aviso cuando un invitado rechaza o cambia un evento (ítem 8), con webhooks de Google y Microsoft.
- Resúmenes por Slack y notificaciones al móvil.
- Agente de IA que interprete correos y coordine reuniones.
- Búsqueda de horario común entre varias personas.

## Cómo presentar la sincronización en vivo

Es lo que mejor muestra el espíritu de 5C2F5: con la página pública abierta, crear un evento en el calendario conectado en un horario libre y recargar. Ese horario desaparece de la lista. No hace falta ninguna acción dentro de la app.
