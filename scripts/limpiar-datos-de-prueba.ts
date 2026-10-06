/**
 * Limpia las reservas de prueba de UNA base de datos, y borra también sus eventos del
 * calendario real (Google u Outlook) para que no queden bloques "Ocupado" de más.
 *
 * Por seguridad NO borra nada salvo que se pida con --aplicar. Sin esa opción solo muestra
 * qué borraría ("simulación").
 *
 * Uso (PowerShell), desde la carpeta del proyecto:
 *
 *   # 1) Ver qué se borraría (no cambia nada):
 *   npx tsx scripts/limpiar-datos-de-prueba.ts --todo
 *
 *   # 2) Borrar de verdad. Hay que elegir el alcance:
 *   npx tsx scripts/limpiar-datos-de-prueba.ts --todo --aplicar            # todas las reservas
 *   npx tsx scripts/limpiar-datos-de-prueba.ts --solo-prueba --aplicar     # solo las que parecen de prueba
 *
 * Usa la base que indique DATABASE_URL (la del archivo .env, que es la de desarrollo). Para
 * limpiar producción, primero apuntar DATABASE_URL a producción en esa misma ventana:
 *
 *   $env:DATABASE_URL="<url de producción>"
 *
 * Qué se borra con --aplicar:
 *   - Las reservas elegidas y, en cascada, sus registros de notificaciones (eso limpia el aviso
 *     de "notificaciones fallidas" del Panel).
 *   - El evento de cada reserva en el calendario real, sin avisar a los invitados.
 *   - Los contadores del límite de peticiones (RateLimit), por si una prueba dejó algún bloqueo.
 * No se tocan: la configuración, los servicios, los calendarios conectados ni los eventos del
 * calendario que no pertenezcan a ninguna reserva de esta base.
 */
import { PrismaClient } from "@prisma/client";
import { getValidAccessToken } from "../src/lib/calendar/tokenManager";
import { deleteGoogleEvent } from "../src/lib/calendar/google";
import { deleteOutlookEvent } from "../src/lib/calendar/outlook";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const apply = args.has("--aplicar");
const all = args.has("--todo");
const onlyTests = args.has("--solo-prueba");

const TEST_PATTERN = /(\[qa\]|\[demo\]|test|prueba|yuyuyu|tucu|race)/i;

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(DATABASE_URL no válida)";
  }
}

async function main() {
  if (all === onlyTests) {
    console.log("Elegí el alcance: --todo (todas las reservas) o --solo-prueba (las que parecen de prueba).");
    process.exit(1);
  }

  console.log(`\nBase de datos: ${databaseHost()}`);
  console.log(`Alcance: ${all ? "TODAS las reservas" : "solo las que parecen de prueba"}\n`);

  const bookings = await prisma.booking.findMany({
    include: { professional: { include: { calendarConnections: true } } },
    orderBy: { startTime: "asc" },
  });
  const targets = all ? bookings : bookings.filter((b) => TEST_PATTERN.test(b.clientName));
  const kept = bookings.length - targets.length;

  for (const b of targets) {
    const when = b.startTime.toISOString().slice(0, 16).replace("T", " ");
    console.log(`  - ${when} UTC  ${b.status.padEnd(9)}  ${b.clientName.slice(0, 40).padEnd(40)}  ${b.externalEventId ? "con evento" : "sin evento"}`);
  }
  console.log(`\nSe borrarían ${targets.length} reservas (quedarían ${kept}).`);

  if (!apply) {
    console.log("\nSIMULACIÓN: no se borró nada. Para borrar de verdad, agregá --aplicar al mismo comando.");
    return;
  }

  let eventsDeleted = 0;
  let eventsFailed = 0;
  for (const b of targets) {
    if (!b.externalEventId || !b.calendarProvider) continue;
    const connection = b.professional.calendarConnections.find((c) => c.provider === b.calendarProvider && c.isActive);
    if (!connection) {
      eventsFailed += 1;
      continue;
    }
    try {
      const accessToken = await getValidAccessToken(connection);
      if (connection.provider === "GOOGLE") {
        await deleteGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId: b.externalEventId });
      } else {
        await deleteOutlookEvent({ accessToken, eventId: b.externalEventId });
      }
      eventsDeleted += 1;
    } catch (err) {
      // Si el evento ya no existe (404/410) no hay nada que borrar; cualquier otro error se informa.
      const message = String((err as { message?: string })?.message ?? err);
      if (/\b(404|410)\b|not found|deleted/i.test(message)) eventsDeleted += 1;
      else {
        eventsFailed += 1;
        console.log(`  ! No se pudo borrar el evento de "${b.clientName}": ${message.slice(0, 100)}`);
      }
    }
  }

  const deleted = await prisma.booking.deleteMany({ where: { id: { in: targets.map((b) => b.id) } } });
  const limits = await prisma.rateLimit.deleteMany({});

  console.log(`\nListo. Reservas borradas: ${deleted.count}. Eventos de calendario borrados: ${eventsDeleted}${eventsFailed ? ` (no se pudieron borrar ${eventsFailed})` : ""}. Contadores de límite borrados: ${limits.count}.`);
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
