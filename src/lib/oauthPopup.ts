import { NextResponse } from "next/server";

/**
 * Página HTML mínima que devuelven los callbacks de OAuth (Google/Outlook)
 * cuando la conexión se inició desde una ventana emergente (popup) en vez de
 * navegar la pestaña principal. Le avisa a la ventana que la abrió (vía
 * postMessage) que terminó, y se cierra sola — así, si Google/Microsoft
 * muestra un error, el usuario solo tiene que cerrar este popup chico en vez
 * de sentirse perdido navegando lejos del panel (ver
 * agendate_ideas_originales_gap_analysis en memoria del proyecto: mejoras de
 * demo pedidas por el usuario el 2026-08-20).
 *
 * No depende de ningún estilo del proyecto a propósito (se muestra 1-4
 * segundos nada más, en una ventana sin navegación).
 */
export function renderOAuthPopupClosePage(opts: { ok: boolean; provider: "google" | "outlook"; message: string }) {
  const { ok, provider, message } = opts;
  const title = ok ? "¡Listo!" : "No se pudo conectar";
  const delayMs = ok ? 1200 : 5000;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f4f7fb;color:#16233d;">
  <div style="text-align:center;max-width:340px;padding:28px;">
    <div style="font-size:16px;font-weight:800;margin:0 0 8px;">${title}</div>
    <p style="font-size:13.5px;line-height:1.5;color:#5a6884;margin:0 0 18px;">${message}</p>
    <button onclick="window.close()" style="border:1px solid #d6deeb;background:#fff;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:600;color:#22314f;cursor:pointer;">Cerrar esta ventana</button>
  </div>
  <script>
    (function () {
      if (window.opener) {
        try {
          window.opener.postMessage({ source: "agendate-oauth", ok: ${ok ? "true" : "false"}, provider: "${provider}" }, window.location.origin);
        } catch (e) {}
      }
      setTimeout(function () { window.close(); }, ${delayMs});
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
