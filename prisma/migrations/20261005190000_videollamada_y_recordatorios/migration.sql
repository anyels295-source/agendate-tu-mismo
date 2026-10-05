-- Videollamada automática y recordatorios.
-- Solo agrega columnas opcionales (o con valor por defecto): no modifica ni borra datos existentes.

-- Link de la videollamada (Google Meet o Teams) que se crea junto con el evento del calendario.
ALTER TABLE "Booking" ADD COLUMN "meetingUrl" TEXT;

-- Cuándo se envió el recordatorio del día anterior; evita mandar dos veces el mismo.
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- Si el profesional quiere que cada reserva incluya una videollamada.
ALTER TABLE "Professional" ADD COLUMN "videoCallEnabled" BOOLEAN NOT NULL DEFAULT false;
