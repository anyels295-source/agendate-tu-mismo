"use client";

/**
 * Botón "Compartir por WhatsApp" para la página de reserva del profesional.
 *
 * La idea original (68ZG6 - Agendate tú mismo) describe el flujo como
 * "enviar este link a sus clientes" por WhatsApp — hasta ahora solo existía
 * "Copiar link", que obliga a abrir WhatsApp aparte y pegar. Este botón abre
 * WhatsApp (app en mobile, WhatsApp Web en desktop) con el mensaje y el link
 * ya cargados, listo para elegir el contacto o grupo y enviar.
 *
 * No hace falta ningún backend ni credencial de WhatsApp Business para esto
 * (es distinto del envío automático de confirmaciones vía Cloud API): es el
 * mismo mecanismo que el botón "Compartir" de wa.me que cualquier sitio
 * puede usar.
 */
export default function ShareWhatsAppButton({
  url,
  professionalName,
  className,
}: {
  url: string;
  professionalName: string;
  className?: string;
}) {
  const message = `Reservá tu turno con ${professionalName} acá: ${url}`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noreferrer"
      className={className}
      aria-label="Compartir el link de reserva por WhatsApp"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.22 8.22 0 0 1-1.26-4.37c0-4.55 3.7-8.25 8.26-8.25 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.42 5.84c0 4.55-3.71 8.23-8.26 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.41-.42-.56-.42h-.48c-.16 0-.42.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
      </svg>
      Compartir por WhatsApp
    </a>
  );
}
