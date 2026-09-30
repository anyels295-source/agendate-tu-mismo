import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

type BookingStatusValue = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

/**
 * Datos de ejemplo para probar el buscador/filtro de Agenda y los reportes
 * por período (Hoy/Esta semana/Este mes/rango), y de paso confirmar que la
 * app se conecta bien a la base real. Ver agendate_ideas_originales_gap_analysis
 * en memoria del proyecto — pedido el 2026-08-24.
 *
 * Idempotente: antes de crear turnos nuevos, borra los de una corrida
 * anterior (se identifican por el prefijo "[DEMO]" en el nombre del
 * cliente), así se puede correr de nuevo sin duplicar ni ensuciar la base
 * con datos reales.
 *
 * Uso:
 *   npx tsx prisma/seed-demo.ts            → borra lo anterior y crea turnos nuevos
 *   npx tsx prisma/seed-demo.ts --clear     → solo borra, no crea nada nuevo
 */

const prisma = new PrismaClient();
const DEMO_MARKER = "[DEMO]";

// El email es el contacto obligatorio, así que todos lo tienen; el teléfono
// (WhatsApp) es opcional — dos clientes lo dejan en blanco a propósito, para
// probar que Agenda/Reservas/Reportes lo muestran bien ("Sin WhatsApp"/"—")
// y que las notificaciones no intentan mandar nada por ese canal.
const CLIENTS: { name: string; phone: string | null; email: string }[] = [
  { name: `${DEMO_MARKER} Ana Rodríguez`, phone: "+598 91 111 111", email: "ana.demo@example.com" },
  { name: `${DEMO_MARKER} Bruno Silva`, phone: null, email: "bruno.demo@example.com" },
  { name: `${DEMO_MARKER} Carla Méndez`, phone: "+598 93 333 333", email: "carla.demo@example.com" },
  { name: `${DEMO_MARKER} Diego Fernández`, phone: "+598 94 444 444", email: "diego.demo@example.com" },
  { name: `${DEMO_MARKER} Elena Castro`, phone: "+598 95 555 555", email: "elena.demo@example.com" },
  { name: `${DEMO_MARKER} Facundo Pereira`, phone: null, email: "facundo.demo@example.com" },
  { name: `${DEMO_MARKER} Gabriela Souza`, phone: "+598 97 777 777", email: "gabriela.demo@example.com" },
  { name: `${DEMO_MARKER} Hernán Acosta`, phone: "+598 98 888 888", email: "hernan.demo@example.com" },
];

const STATUSES: BookingStatusValue[] = ["CONFIRMED", "CONFIRMED", "PENDING", "COMPLETED", "NO_SHOW", "CANCELLED", "CONFIRMED", "PENDING"];

async function clearDemoData() {
  const deleted = await prisma.booking.deleteMany({ where: { clientName: { startsWith: DEMO_MARKER } } });
  console.log(`Borrados ${deleted.count} turno(s) de demo de una corrida anterior.`);
}

async function main() {
  const clearOnly = process.argv.includes("--clear");
  await clearDemoData();
  if (clearOnly) {
    console.log("Listo — solo se limpiaron los datos de demo, no se creó nada nuevo.");
    return;
  }

  const professionals = await prisma.professional.findMany({
    include: { services: { where: { active: true }, orderBy: { order: "asc" } } },
  });

  if (professionals.length === 0) {
    console.log(
      "No hay ningún profesional creado todavía. Entrá una vez al panel admin (se crea el primero automáticamente) y volvé a correr este script."
    );
    return;
  }

  for (const professional of professionals) {
    const tz = professional.timezone || "America/Montevideo";
    const now = DateTime.now().setZone(tz);
    const services = professional.services;

    let created = 0;
    for (let i = 0; i < CLIENTS.length; i++) {
      const client = CLIENTS[i];
      const status = STATUSES[i % STATUSES.length];
      const service = services.length > 0 ? services[i % services.length] : null;
      const durationMinutes = service?.durationMinutes ?? professional.durationMinutes;

      // Repartidos entre esta semana, la semana pasada y hace ~un mes, para
      // poder probar los 3 presets de Reportes (Hoy/Esta semana/Este mes) y
      // también un rango personalizado que abarque todo.
      let startTime: DateTime;
      if (i < 3) {
        startTime = now.startOf("week").plus({ days: i, hours: 9 + i });
      } else if (i < 6) {
        startTime = now.startOf("week").minus({ weeks: 1 }).plus({ days: i - 3, hours: 10 + i });
      } else {
        startTime = now.startOf("month").minus({ days: 3 }).plus({ hours: 11 + i });
      }
      const endTime = startTime.plus({ minutes: durationMinutes });

      await prisma.booking.create({
        data: {
          professionalId: professional.id,
          serviceId: service?.id,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          startTime: startTime.toJSDate(),
          endTime: endTime.toJSDate(),
          status,
          notes: "Turno de ejemplo generado por prisma/seed-demo.ts",
        },
      });
      created++;
    }
    console.log(`${professional.name} (${professional.slug}): ${created} turno(s) de demo creados.`);
  }

  console.log("Listo. Para borrarlos más adelante: npx tsx prisma/seed-demo.ts --clear");
}

main()
  .catch((err) => {
    console.error("Error al cargar los datos de demo — si dice P1001, es que no se pudo conectar a la base:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
