import { NextResponse, type NextRequest } from "next/server";

/**
 * Le pasa al servidor la dirección que se pidió (ruta y parámetros) en el encabezado
 * `x-pathname`. El layout del panel la usa para que, si hay que iniciar sesión, el login
 * devuelva a esa misma página (por ejemplo, el link "Confirmar desde el panel" de un email).
 * No decide nada de seguridad: la sesión se sigue verificando en el layout y en cada API.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/admin/:path*"] };
