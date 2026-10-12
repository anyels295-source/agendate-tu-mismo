-- Pedido de confirmación de turnos pendientes.
-- Solo agrega una columna opcional: no modifica ni borra datos existentes.

-- Cuándo se le pidió al cliente que confirme su turno pendiente. Si pasan 24 horas sin
-- confirmación, el cron diario cancela el turno y libera el horario.
ALTER TABLE "Booking" ADD COLUMN "confirmationRequestedAt" TIMESTAMP(3);
