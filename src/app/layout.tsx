import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agendate Tú Mismo",
  description: "Reservá tu turno en segundos, sin llamadas ni WhatsApp cruzados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
