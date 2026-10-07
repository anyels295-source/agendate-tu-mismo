# Guion de la demo: Agéndate Tú Mismo

Video del jueves 8 de octubre. Duración objetivo: **7 a 8 minutos**. Ensayo: miércoles 7.

**La historia que cuenta el video:** un emprendedor deja de coordinar turnos por WhatsApp. Comparte un link, sus clientes reservan solos viendo solo los horarios libres reales, y todo queda en su calendario con videollamada, avisos y reportes.

Cada escena tiene tres partes:
- **Qué mostrar:** lo que hay que hacer en la pantalla.
- **Qué decir:** el texto para leer o adaptar.
- **Cuidado:** lo que puede salir mal y cómo evitarlo.

---

## Antes de grabar

### El día anterior (después del ensayo)

- [ ] **Limpiar las reservas del ensayo en producción**, con la simulación primero y los mismos comandos de siempre. Así el Panel arranca en cero.
- [ ] **Renombrar los servicios** en Configuración. Ejemplo: "Reunión" de 30 min gratis y "Consulta" de 30 min a $39. Hoy se llaman "Reunion" y "Test".
- [ ] **Crear un evento en el Google Calendar** de `anyels295@gmail.com` para el **viernes 9 de 11:00 a 12:00**, con un título como "Dentista". Sirve para mostrar que la app respeta los otros compromisos (escena 4).
- [ ] **Revisar Spam.** Los emails de la app tienen que estar llegando a la bandeja de entrada (ya marcaste "No es spam").

### 15 minutos antes

- [ ] **Abrir y dejar listas estas pestañas**, cada una ya cargada una vez para que no tarde en la grabación:
  1. Panel: `agendate-tu-mismo.vercel.app/admin`, con la sesión iniciada.
  2. Página pública: `agendate-tu-mismo.vercel.app/reservar/ibermudez`, en **vista de celular**. En Chrome: F12 → ícono de celular → iPhone 12 Pro.
  3. Gmail de `anyels295@gmail.com`.
  4. Google Calendar de `anyels295@gmail.com`, en la semana actual.
- [ ] **Silenciar** las notificaciones de Windows, Teams y WhatsApp Web.
- [ ] **Ocultar la barra de favoritos** y cerrar las pestañas que no se usan.
- [ ] **Zoom del navegador al 110 %**, para que se lea en el video.

### Datos que se usan en la demo

| Dato | Valor |
| --- | --- |
| Cliente | Nombre "María González", email `anyels295@gmail.com` |
| Turno | Viernes 9, a las **10:00** |
| Reprogramación | Viernes 9, de 10:00 a **15:00** |

**Por qué siempre `anyels295@gmail.com`:** Resend está en modo prueba y solo entrega a esa dirección. Si se usa otro email, el aviso no llega y el Panel muestra un fallo.

---

## Escena 1. El problema (30 s)

**Qué mostrar:** el Panel vacío, o una diapositiva con el título.

**Qué decir:**
> "Un emprendedor que da turnos (una psicóloga, un profesor particular, un técnico) pierde horas coordinando por WhatsApp: '¿te queda el martes?', 'no, mejor el jueves'. Agéndate Tú Mismo resuelve eso: comparte un link y sus clientes reservan solos, viendo solo los horarios en que de verdad está libre."

---

## Escena 2. Configurar en un minuto (50 s)

**Qué mostrar:** Configuración, recorriendo de arriba hacia abajo **sin cambiar nada**:
1. Nombre y link (`ibermudez`).
2. Email para avisos.
3. Videollamada activada.
4. Horario de lunes a viernes, de 09:00 a 17:30.
5. Servicios con duración y precio.
6. Canales de aviso y recordatorio automático.

**Qué decir:**
> "El emprendedor configura su horario de atención, sus servicios con duración y precio, y si quiere que cada turno tenga una videollamada. La app se conecta a su Google Calendar: todo lo que se reserve aparece ahí, y lo que ya tenga en su calendario se respeta."

**Cuidado:** no toques "Guardar cambios". Si cambiás algo por error, recargá la página.

---

## Escena 3. Compartir el link (20 s)

**Qué mostrar:** en el Panel, la tarjeta "Tu página de reserva". Señalar "Compartir por WhatsApp" y "Copiar link".

**Qué decir:**
> "El link se comparte por WhatsApp con un clic, o se pega en Instagram o en la web del negocio."

**Cuidado:** si abrís el botón de WhatsApp, cerrá la ventana sin enviar nada.

---

## Escena 4. El cliente reserva desde el celular (1 min 30 s)

**Qué mostrar:** la pestaña de la página pública, en vista de celular.
1. Elegir el servicio "Reunión".
2. Tocar el **viernes 9**. Señalar que **no aparecen las 11:00 ni las 11:30**: ahí está el evento "Dentista".
3. Elegir las **10:00**.
4. Completar nombre "María González" y email `anyels295@gmail.com`. El WhatsApp se deja vacío.
5. Tocar "Confirmar turno".
6. Aparece "¡Reserva recibida!", con el estado "Pendiente de confirmación".

**Qué decir:**
> "El cliente entra desde su celular, elige el servicio y el día, y ve solo los horarios libres. Fíjense que el viernes a las 11 no aparece: el emprendedor tiene un turno con el dentista en su Google Calendar, y la app lo respeta sin que tenga que cargar nada dos veces. El cliente deja su nombre y su email, sin crear una cuenta, y listo."

**Cuidado:**
- El horario tiene que estar al menos **2 horas en el futuro** (anticipación mínima). Por eso se usa el viernes.
- Si ya ensayaste ese horario y no limpiaste, va a estar ocupado. En ese caso usá otro.

---

## Escena 5. El emprendedor se entera y confirma (1 min)

**Qué mostrar:**
1. Gmail: el email **"Nuevo turno por confirmar: María González…"**. Abrirlo un segundo.
2. El Panel (recargar): "Tenés 1 turno por confirmar", y el turno en "Próximos turnos".
3. Tocar "Revisar y confirmar". Se abre Reservas, filtrada en Pendientes.
4. Menú ⋮ → **Confirmar turno**. Aparece el aviso "Turno confirmado. Se avisó al cliente por email".

**Qué decir:**
> "Al emprendedor le llega un aviso al instante, y en su panel ve que tiene un turno por confirmar. Lo confirma con un clic y el cliente recibe la confirmación con el link de la videollamada."

**Cuidado:** no toques "Deshacer" en ese aviso.

---

## Escena 6. Todo queda en el calendario (50 s)

**Qué mostrar:**
1. Gmail: el email **"Turno confirmado"** del cliente, con el link de Meet.
2. Google Calendar: el evento del viernes a las 10:00 con el botón de Meet, y al lado el evento "Dentista".
3. La Agenda de la app: el turno en verde y el bloque "Ocupado" de las 11:00. Hacer clic en el turno para mostrar el detalle (servicio, email, videollamada, respuesta a la invitación).

**Qué decir:**
> "El turno ya está en el Google Calendar del emprendedor, con su sala de Meet creada automáticamente. Y en la agenda de la app ve su semana completa: sus turnos y, en gris, lo que tiene en otros calendarios."

---

## Escena 7. Reprogramar (40 s)

**Qué mostrar:** en el detalle del turno, en la Agenda, tocar **Reprogramar**. Elegir el **viernes 9 a las 15:00** y luego "Confirmar nuevo horario".

**Qué decir:**
> "Si hay que moverlo, se reprograma desde acá. La app mueve el mismo evento del calendario (el link de Meet no cambia) y le avisa al cliente con la nueva hora."

**Qué mostrar después:** en Gmail, el email "Turno reprogramado".

---

## Escena 8. El cliente cancela solo (40 s)

**Qué mostrar:**
1. Gmail: abrir el email "Turno reprogramado" y tocar el **link de cancelación**.
2. En la página que se abre, cancelar el turno.
3. Volver a la página pública, en el viernes 9: **las 15:00 está libre otra vez**.
4. Gmail: llega "Turno cancelado" para el emprendedor.

**Qué decir:**
> "Si el cliente no puede ir, cancela él mismo desde el link de su email, sin llamar a nadie. El horario vuelve a quedar disponible al instante y el emprendedor recibe el aviso."

---

## Escena 9. Sin dobles reservas (40 s) (opcional, pero impacta)

**Qué mostrar:**
1. Abrir la página pública en **dos pestañas**.
2. En las dos, elegir el **mismo horario** (viernes 9 a las 16:00) y completar los datos.
3. Tocar "Confirmar turno" en la primera y enseguida en la segunda.
4. La primera muestra "¡Reserva recibida!". La segunda muestra *"El horario elegido ya no está disponible"* y vuelve a la lista de horarios.

**Qué decir:**
> "Y si dos personas quieren el mismo horario a la vez, solo una lo consigue. La base de datos lo impide aunque reserven en el mismo segundo."

**Cuidado:** después cancelá ese turno desde Reservas, o dejalo para la limpieza.

---

## Escena 10. Reportes y automatismos (40 s)

**Qué mostrar:**
1. Reportes: turnos, cancelaciones, servicios, y el botón **Exportar** a CSV.
2. Volver a Configuración → "Recordatorio automático".

**Qué decir:**
> "El emprendedor tiene reportes por día, semana o mes, y puede exportarlos a Excel. Además, la app trabaja sola: el día anterior le recuerda el turno al cliente, y cada mañana le manda al emprendedor un resumen de su agenda del día."

---

## Escena 11. Cierre (40 s)

**Qué mostrar:** el Panel, o una diapositiva de cierre.

**Qué decir:**
> "Agéndate Tú Mismo ya cubre el núcleo de las dos ideas: el emprendedor comparte un link y sus clientes reservan solos (68ZG6), sobre la disponibilidad real de sus calendarios, con videollamada, recordatorios y sin dobles reservas (5C2F5). Los próximos pasos son: dominio propio, que cada emprendedor pueda registrarse solo, conectar Outlook de la empresa y sumar inteligencia artificial para coordinar reuniones desde el correo."

---

## Qué no mostrar

| Evitar | Por qué |
| --- | --- |
| Emails de clientes distintos de `anyels295@gmail.com` | Resend en modo prueba: no llegan y el Panel marca el fallo |
| WhatsApp como canal de aviso | La plantilla solo cubre confirmaciones; sin un teléfono real de prueba no hay nada que mostrar |
| Conectar Outlook | Falta el permiso del administrador de la empresa |
| "Aceptar la invitación" desde el calendario del cliente | Necesita un cliente con **otra** cuenta de Google: Google no se manda invitaciones a sí mismo. Si tenés una segunda cuenta, se puede sumar como escena extra |
| Usuarios y roles | No existen todavía (hay un único administrador). Si preguntan, es lo que sigue |

## Si algo falla durante la grabación

| Si pasa esto | Hacé esto |
| --- | --- |
| Una pantalla tarda | Esperá. La primera carga puede tardar 3 a 5 s. Se puede cortar en la edición |
| Un email no llega | Buscalo en Spam. Si no está, seguí: el Panel y el calendario alcanzan para mostrar el flujo |
| Dice "horario no disponible" | Ese horario quedó ocupado de un intento anterior. Elegí otro |
| Hay que repetir todo desde cero | Corré la limpieza (simulación y después `--aplicar`) y empezá de nuevo |

## Ensayo de hoy (miércoles 7)

1. Hacer el recorrido completo una vez, con el texto en voz alta y midiendo el tiempo.
2. Anotar qué escenas se pasan de tiempo y recortar texto.
3. Al terminar, limpiar las reservas del ensayo en producción.
4. Crear el evento "Dentista" (si se borró) y renombrar los servicios.
