/**
 * Error de negocio "seguro": su mensaje está pensado para mostrarse tal cual
 * al usuario (sin detalles técnicos), a diferencia de una excepción
 * inesperada (Prisma, red, etc.) cuyo mensaje real nunca debe llegar al
 * cliente. Las rutas API deben chequear `instanceof AppError` antes de
 * reenviar `err.message` — cualquier otro error se responde con un mensaje
 * genérico y se loguea el detalle real solo en el servidor.
 */
export class AppError extends Error {}
