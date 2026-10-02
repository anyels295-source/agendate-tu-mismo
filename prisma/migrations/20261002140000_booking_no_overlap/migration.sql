-- Evita la doble reserva a nivel de base de datos.
--
-- El código comprueba que el horario esté libre antes de crear un turno, pero
-- esa comprobación y el INSERT no son atómicos: dos pedidos simultáneos por el
-- mismo hueco podían pasar ambos. Esta restricción de exclusión hace que
-- Postgres rechace (error 23P01) cualquier turno Pendiente o Confirmado de un
-- mismo profesional que se solape con otro. Los turnos Cancelados, Completados
-- y Ausentes no bloquean el horario. Los rangos son [inicio, fin): dos turnos
-- pegados (uno termina a las 10:00 y el otro empieza a las 10:00) no se solapan.
--
-- Antes de aplicarla en una base con datos, verificar que no haya solapados
-- existentes (si los hay, la migración falla sin cambiar nada):
--
--   SELECT a.id, b.id, a."professionalId", a."startTime", a."endTime", b."startTime", b."endTime"
--   FROM "Booking" a JOIN "Booking" b
--     ON a."professionalId" = b."professionalId" AND a.id < b.id
--    AND a.status IN ('PENDING', 'CONFIRMED') AND b.status IN ('PENDING', 'CONFIRMED')
--    AND tsrange(a."startTime", a."endTime", '[)') && tsrange(b."startTime", b."endTime", '[)');
--
-- Prisma no puede expresar este tipo de restricción en schema.prisma; vive solo acá.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist (
    "professionalId" WITH =,
    (tsrange("startTime", "endTime", '[)')) WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
