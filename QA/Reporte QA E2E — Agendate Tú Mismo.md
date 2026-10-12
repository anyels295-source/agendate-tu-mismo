# Reporte QA E2E — Agendate Tú Mismo

Oct 2, 2026 · @Iyaris Bermudez

## Resumen

Encontré **25 bugs** (5 altos, 11 medios, 9 bajos) y **16 mejoras**. Lo más grave: la disponibilidad no respeta el horario configurado, se pueden cerrar turnos futuros sin confirmación, y el link público apunta al deployment `git-dev`. El núcleo de reservas es sólido: el servidor bloquea la doble reserva y los conteos cuadran entre Panel, Reservas y Reportes.

| Ítem | Detalle |
| --- | --- |
| Entorno | Preview Vercel `agendate-tu-mismo-3680n085o…vercel.app`, Chrome desktop (894 px) + vista 390 px simulada |
| Usuario | Iyaris Bermúdez (rol "Consulta"), slug `ibermudez` |
| Cobertura | Panel, Agenda, Reservas, Reportes, Calendarios, Configuración, página pública `/reservar/ibermudez` |
| Fecha y hora | 2 oct 2026, 09:10–09:45 (GMT-3) |
| Fuera de alcance | Login/logout, OAuth de calendarios, recepción real de WhatsApp/email |

## Bugs de severidad alta

| # | Módulo | Bug | Cómo reproducir | Esperado |
| --- | --- | --- | --- | --- |
| A1 | Disponibilidad | Se ofrecen horarios fuera del horario de atención | Configuración muestra L–V 09:00–13:00 (un tramo). En `/reservar/ibermudez` y en "Nueva reserva" aparecen 14:00–17:30 | Solo slots dentro de los tramos configurados. Revisar si la UI no muestra un 2.º tramo guardado o si el motor lo ignora |
| A2 | Reservas | Se puede marcar Completada/Ausente un turno futuro, sin confirmación ni deshacer | A las 09:10, menú ⋮ del turno de las 09:15 → "Marcar completada". Se aplica al instante y el turno pierde su menú | Deshabilitar antes de la hora de inicio; pedir confirmación o dar "Deshacer" |
| A3 | Compartir | El link público apunta a otro deployment | "Compartir por WhatsApp", "Copiar link" y "Tu página de reserva" usan `agendate-tu-mismo-git-dev-…vercel.app` | Usar el dominio de producción (revisar la env var de URL base) |
| A4 | Formularios | Validación de teléfono inconsistente | Pública acepta `777777777777777777`. Admin rechaza `abc123` pidiendo código de país, pero acepta `094 123 456` sin él | Misma regla en ambos lados; normalizar a E.164 (+598…) |
| A5 | Notificaciones | Los emails fallan y el estado dice "sincronizado" | Panel: "19 notificaciones no se pudieron enviar en 7 días", 2 por evento. Calendarios: Google conectado pero sin "calendario de reservas" elegido | Verificar proveedor de email con un correo real; avisar si no hay calendario destino en vez de "Calendarios sincronizados" |

A5 queda por confirmar: las pruebas usaron `@example.com`, que algunos proveedores rechazan, pero ya había fallos previos a la sesión.

## Bugs de severidad media y baja

| # | Sev. | Módulo | Bug y cómo verlo |
| --- | --- | --- | --- |
| M1 | Media | Global | Los toasts no se cierran solos ("Turno actualizado" siguió visible más de 5 min) y se apilan uno encima del otro, tapando el botón "Crear reserva" |
| M2 | Media | Reservas | El aviso "Reserva creada para \[QA\] Tester Uno · 16:00" queda fijo y desactualizado después de reprogramar a 14:30 |
| M3 | Media | Pública | "Reservar otro turno" no recarga los horarios: el 10:00 recién tomado se sigue ofreciendo. El servidor lo rechaza al confirmar ("ya no está disponible"), pero no vuelve a la lista de horarios |
| M4 | Media | Reprogramar | El propio turno bloquea los slots vecinos: uno de 16:00–16:30 no puede moverse a 15:45 ni a 16:15 |
| M5 | Media | Disponibilidad | La anticipación mínima de 2 h se aplica en Reprogramar y en la página pública, pero no en "Nueva reserva" (ofreció 09:45 a las 09:10). Si es a propósito, indicarlo en la UI |
| M6 | Media | Agenda | El selector de fecha navega en cada tecla: al tipear quedó `date=82026-10-05` en la URL, el input muestra 05/10/82026 y el calendario otra semana |
| M7 | Media | Reportes | Un rango invertido (31/12 → 01/01) muestra el mes actual sin ningún aviso |
| M8 | Media | Mobile | A 390 px el Panel mide 1533 px de ancho (gráfico "Turnos por día") y Reservas 493 px: Estado y ⋮ quedan cortados |
| M9 | Media | Reservas | Un teléfono largo se superpone con la columna Estado (no se trunca) |
| M10 | Media | Exportar | El CSV no tiene BOM UTF-8 (acentos rotos en Excel), no incluye email ni notas y siempre se llama `reservas.csv` |
| M11 | Media | Servicios | Duración `-15` se guarda como 15 sin aviso; el precio acepta texto (`abc`, `free`); se guarda al instante y "Quitar" no pide confirmación |
| B1 | Baja | Búsqueda | No ignora acentos (`mendez` no encuentra Méndez) ni normaliza teléfonos (`93333` no encuentra +598 93 333 333) |
| B2 | Baja | Reservas | El avatar toma "\[" como inicial: "\[T", "\[D" |
| B3 | Baja | Agenda | Meses en inglés ("28 Sep – 4 Oct"); Reportes usa español ("1 ene – 31 dic") |
| B4 | Baja | Pública | Un slug inexistente muestra el 404 genérico de Next.js en inglés |
| B5 | Baja | Accesibilidad | Flechas de Agenda sin nombre accesible; días leídos como "viernes octubre" sin número; chips sin `aria-pressed`; modales sin `role=dialog`; toasts sin `aria-live`; inputs de hora sin label; "Telegram (pronto)" clicable |
| B6 | Baja | Global | Todas las páginas tienen el mismo título de pestaña |
| B7 | Baja | Formularios | Nombre sin límite: se aceptaron 170 caracteres sin espacios |
| B8 | Baja | Permisos | El rol "Consulta" puede crear, cancelar y editar configuración. Verificar si es el permiso esperado |
| B9 | Baja | Formularios | Los errores aparecen de a uno y al pie del formulario, no junto al campo |

## Mejoras propuestas

| Prioridad | Módulo | Mejora |
| --- | --- | --- |
| Alta | Reservas | Permitir corregir turnos Cancelados, Completados o Ausentes (hoy no tienen menú ⋮): reactivar o cambiar estado |
| Alta | Reservas | Confirmación o "Deshacer" en el toast para Completar, Ausente y Confirmar, igual que en Cancelar |
| Alta | Reservas | Cerrar turnos pasados: hay 10 en "Confirmada" con fecha vencida. Auto-marcar o mostrar "pendientes de cierre" |
| Alta | Configuración | Quitar el bloque legado "Nombre del servicio / Duración" de Datos básicos: dice "Consulta", que no figura entre los servicios reservables |
| Media | Reservas | Agregar el filtro "Ausentes" (existen 2 turnos y solo se ven en "Todas") |
| Media | Reservas | Al crear un turno manual, elegir si queda Confirmada (hoy siempre Pendiente) |
| Media | Reservas | Permitir agendar a más de 6 días hábiles desde el admin (selector de fecha o más días) |
| Media | Pública | Mostrar el precio del servicio (Test tiene 39 y no se ve) |
| Media | Pública | Pantalla final: el título "¡Turno agendado!" choca con "queda pendiente de confirmación". Sumar "Agregar a mi calendario (.ics)" |
| Media | Pública | Tras "El horario ya no está disponible", volver a la lista con horarios actualizados |
| Media | Panel | Notificaciones fallidas: mostrar el motivo y un botón "Reintentar" |
| Media | Configuración | Pedir confirmación al quitar un servicio con turnos asociados |
| Baja | Reservas | Guardar filtro y búsqueda en la URL; botón para limpiar la búsqueda |
| Baja | Agenda | Acciones (reprogramar, cancelar) desde el popup del turno |
| Baja | Reportes | Unificar orden con Reservas; "Servicios más pedidos" hoy cuenta cancelados |
| Baja | Pública | "Reservar otro turno" deja precargados nombre, email y teléfono: limpiarlos o preguntar (dispositivos compartidos) |

## Lo que funcionó bien

- **Doble reserva bloqueada en servidor:** dos pestañas eligieron lun 5 oct 11:00 y la segunda recibió "El horario elegido ya no está disponible".
- **Solapamientos:** un turno de 30 min a las 16:00 quita 15:45 y 16:15 en todos los servicios.
- **Zona horaria:** Montevideo 11:30 se muestra como Madrid 16:30 (+5 h, correcto en octubre).
- **Validaciones básicas:** nombre vacío o solo espacios, email inválido.
- **Sin XSS:** `<b>QA</b>` en notas se muestra como texto.
- **Datos consistentes:** 20 turnos en 2026 en Reservas, Reportes y CSV; KPIs del Panel correctos.
- Filtros por estado, estado vacío de búsqueda, confirmación al cancelar, vista previa del mensaje al reprogramar.

## Datos de prueba y pendientes

| Registro | Estado final | Acción necesaria |
| --- | --- | --- |
| yuyuyu · 2 oct 09:15 (real) | Completada por un clic accidental mío | Volver a Confirmada desde la base: la UI no lo permite |
| \[QA\] Tester Uno · 2 oct 14:30 | Confirmada | Cancelar a mano. No lo cancelé porque avisa por WhatsApp a `094 123 456`, que puede ser un número real |
| \[QA\] Publico… · 5 oct 10:00 | Cancelada | Ninguna |
| \[QA\] Race B · 5 oct 11:00 | Cancelada | Ninguna |
| Servicio "\[QA\] Servicio" | Eliminado | Ninguna |

No toqué Calendarios (Google conectado, sin calendario de reservas elegido) ni el horario de atención.
