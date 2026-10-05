// Comprobación previa a la migración "booking_no_overlap" (SOLO LECTURA).
// Lista los turnos Pendiente/Confirmado de un mismo profesional que se solapan:
// si hay alguno, la migración falla hasta que se resuelvan a mano.
//
// Uso (PowerShell):
//   $env:DATABASE_URL="<url de la base>"
//   node scripts/check-booking-overlaps.js
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const overlaps = await prisma.$queryRawUnsafe(`
    SELECT a.id AS turno_a, b.id AS turno_b, a."professionalId" AS profesional,
           a."clientName" AS cliente_a, b."clientName" AS cliente_b,
           a."startTime" AS inicio_a, a."endTime" AS fin_a,
           b."startTime" AS inicio_b, b."endTime" AS fin_b,
           a.status::text AS estado_a, b.status::text AS estado_b
    FROM "Booking" a
    JOIN "Booking" b
      ON a."professionalId" = b."professionalId" AND a.id < b.id
     AND a.status IN ('PENDING', 'CONFIRMED') AND b.status IN ('PENDING', 'CONFIRMED')
     AND tsrange(a."startTime", a."endTime", '[)') && tsrange(b."startTime", b."endTime", '[)')
  `);
  const inverted = await prisma.$queryRawUnsafe(`SELECT id FROM "Booking" WHERE "endTime" < "startTime"`);

  console.log(`Turnos solapados: ${overlaps.length}`);
  if (overlaps.length > 0) console.log(JSON.stringify(overlaps, null, 2));
  console.log(`Turnos con fin anterior al inicio: ${inverted.length}`);
  console.log(overlaps.length === 0 && inverted.length === 0 ? "OK: se puede aplicar la migración." : "REVISAR: resolver esto antes de migrar.");
  await prisma.$disconnect();
})().catch((err) => {
  console.error("Error:", String(err.message).split("\n").filter(Boolean).slice(-2).join(" | "));
  process.exit(1);
});
