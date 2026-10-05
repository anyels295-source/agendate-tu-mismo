/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Evita que el navegador "adivine" el tipo de un archivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No envía la dirección completa de la página al navegar a otro sitio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara, micrófono ni ubicación: se desactivan.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Obliga a usar HTTPS en visitas futuras.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El panel y la API no deben poder mostrarse dentro de otro sitio (clickjacking).
      // La página pública de reservas sí puede incrustarse.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/api/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
