"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "./ConfirmDialog";
import SetBookingCalendarSelect from "@/components/SetBookingCalendarSelect";
import { IconTrash } from "./icons";

const PROVIDER_LABEL: Record<string, string> = { GOOGLE: "Google Calendar", OUTLOOK: "Outlook / Microsoft 365" };

type Connection = { id: string; provider: "GOOGLE" | "OUTLOOK"; accountEmail: string };

type Banner = { kind: "ok" | "error"; text: string } | null;

/**
 * Maneja toda la interacción de la página Calendarios: abrir el flujo de
 * conexión en una ventana emergente (en vez de navegar la pestaña principal
 * a Google/Microsoft), escuchar cuándo esa ventana termina, y desconectar
 * calendarios ya vinculados. Ver agendate_ideas_originales_gap_analysis en
 * memoria del proyecto — mejoras pedidas el 2026-08-20.
 */
export default function CalendarManager({
  professionalId,
  connections,
  bookingCalendarId,
  initialConnected,
  initialError,
}: {
  professionalId: string;
  connections: Connection[];
  bookingCalendarId: string | null;
  initialConnected?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner>(
    initialConnected
      ? { kind: "ok", text: `${PROVIDER_LABEL[initialConnected.toUpperCase()] ?? initialConnected} conectado correctamente.` }
      : initialError
      ? { kind: "error", text: `No se pudo conectar el calendario (${initialError}). Revisá las credenciales en .env y reintentá.` }
      : null
  );
  const [disconnectTarget, setDisconnectTarget] = useState<Connection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // `postMessage` es el camino rápido para saber que el popup terminó, pero
  // no es 100% confiable: si Google/Microsoft sirven esas páginas con una
  // Cross-Origin-Opener-Policy restrictiva, el navegador corta la
  // referencia `window.opener` del popup aunque después vuelva a nuestro
  // propio dominio — el mensaje nunca llega y la pantalla se queda
  // "Sin conectar" hasta que el usuario recarga a mano (bug reportado el
  // 2026-08-24). Por eso también vigilamos si la ventana se cerró sola
  // (`popup.closed`) como red de seguridad: si a esa altura no llegó
  // ningún mensaje, refrescamos igual. Ver agendate_ideas_originales_gap_analysis
  // / agendate_calendarios_agenda_ux en memoria del proyecto.
  const messageReceivedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "agendate-oauth") return;
      messageReceivedRef.current = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setBanner({
        kind: data.ok ? "ok" : "error",
        text: data.ok
          ? `${PROVIDER_LABEL[String(data.provider).toUpperCase()] ?? data.provider} conectado correctamente.`
          : "No se pudo conectar el calendario. Probá de nuevo en unos segundos.",
      });
      router.refresh();
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  function connect(provider: "google" | "outlook") {
    const url = `/api/auth/${provider}?professionalId=${professionalId}&popup=1`;
    const popup = window.open(url, "agendate_oauth", "width=520,height=650,menubar=no,toolbar=no,noopener=no");
    if (!popup) {
      // El navegador bloqueó el popup: seguimos con el flujo de siempre
      // (navega la pestaña principal, sin el parámetro popup).
      window.location.href = `/api/auth/${provider}?professionalId=${professionalId}`;
      return;
    }

    messageReceivedRef.current = false;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(pollRef.current!);
      pollRef.current = null;
      // Si el mensaje de "terminé" nunca llegó pero la ventana ya se
      // cerró, refrescamos de todas formas — no sabemos con certeza si
      // quedó conectado o no, así que el mensaje queda neutro a propósito.
      if (!messageReceivedRef.current) {
        setBanner({
          kind: "ok",
          text: "Revisamos la conexión. Si completaste el paso con Google/Microsoft, ya debería verse acá abajo.",
        });
        router.refresh();
      }
    }, 500);
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/admin/calendar-connections/${disconnectTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        setBanner({ kind: "error", text: "No se pudo desconectar el calendario. Probá de nuevo." });
      } else {
        setBanner({ kind: "ok", text: `${PROVIDER_LABEL[disconnectTarget.provider]} desconectado.` });
      }
    } catch {
      setBanner({ kind: "error", text: "No se pudo desconectar el calendario. Revisá tu conexión." });
    } finally {
      setDisconnecting(false);
      setDisconnectTarget(null);
      router.refresh();
    }
  }

  const googleConn = connections.find((c) => c.provider === "GOOGLE");
  const outlookConn = connections.find((c) => c.provider === "OUTLOOK");

  return (
    <>
      {banner && (
        <p
          className="mb-4 rounded-[11px] px-3.5 py-2.5 text-[13.5px]"
          style={
            banner.kind === "ok"
              ? { background: "#e4f6ec", color: "#1a7d45" }
              : { background: "#fbe7e7", color: "#b6382f" }
          }
        >
          {banner.text}
        </p>
      )}

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <ProviderCard
          letter="G"
          name="Google Calendar"
          connected={!!googleConn}
          connectedLabel={googleConn?.accountEmail}
          onConnect={() => connect("google")}
        />
        <ProviderCard
          letter="O"
          name="Outlook / Microsoft 365"
          connected={!!outlookConn}
          connectedLabel={outlookConn?.accountEmail}
          onConnect={() => connect("outlook")}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-4 bg-[var(--subtle)] p-[13px_20px] text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted-nav)]">
          <span>Proveedor</span>
          <span>Cuenta</span>
          <span>Calendario de reservas</span>
          <span className="text-right">Acciones</span>
        </div>
        {connections.length === 0 && (
          <div className="px-5 py-11 text-center text-[14px] text-[var(--muted-nav)]">
            Todavía no conectaste ningún calendario. Sin al menos uno, tu página de reserva no puede calcular
            disponibilidad.
          </div>
        )}
        {connections.map((c) => (
          <div key={c.id} className="grid grid-cols-4 items-center border-t border-[var(--line3)] p-[15px_20px] text-[13.5px]">
            <div className="font-semibold text-[var(--ink2)]">{PROVIDER_LABEL[c.provider]}</div>
            <div className="truncate text-[#5a6884]">{c.accountEmail}</div>
            <div>
              <SetBookingCalendarSelect connectionId={c.id} checked={bookingCalendarId === c.id} />
            </div>
            <div className="text-right">
              <button
                onClick={() => setDisconnectTarget(c)}
                aria-label={`Desconectar ${PROVIDER_LABEL[c.provider]} (${c.accountEmail})`}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--line-btn)] px-3 py-[7px] text-[12.5px] font-semibold text-[#b6382f] hover:bg-[#fbecea]"
              >
                <IconTrash />
                Desconectar
              </button>
            </div>
          </div>
        ))}
      </div>

      {disconnectTarget && (
        <ConfirmDialog
          title={`¿Desconectar ${PROVIDER_LABEL[disconnectTarget.provider]}?`}
          description={`Se deja de usar la cuenta ${disconnectTarget.accountEmail} para calcular disponibilidad y crear turnos. Los turnos ya creados no se borran. Vas a poder volver a conectar esta u otra cuenta cuando quieras.`}
          confirmLabel="Desconectar"
          danger
          busy={disconnecting}
          onConfirm={handleDisconnect}
          onClose={() => setDisconnectTarget(null)}
        />
      )}
    </>
  );
}

function ProviderCard({
  letter,
  name,
  connected,
  connectedLabel,
  onConnect,
}: {
  letter: string;
  name: string;
  connected: boolean;
  connectedLabel?: string;
  onConnect: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl p-5"
      style={{
        background: "var(--surface)",
        border: connected ? "1px solid var(--line)" : "1px dashed var(--line-btn)",
      }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] font-extrabold"
        style={{ background: connected ? "var(--brand-soft)" : "#f2f5fa", color: connected ? "var(--brand-lt)" : "var(--muted-nav)" }}
      >
        {letter}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-[var(--ink3)]">{name}</div>
        {connected ? (
          <div className="flex items-center gap-[5px] text-[12.5px] font-semibold text-[#3aa55f]">
            <span className="h-[7px] w-[7px] rounded-full bg-[#3aa55f]" />
            {connectedLabel ?? "Conectado"}
          </div>
        ) : (
          <div className="text-[12.5px] text-[var(--muted-nav)]">Sin conectar</div>
        )}
      </div>
      {!connected && (
        <button
          type="button"
          onClick={onConnect}
          className="shrink-0 rounded-[9px] border border-[var(--brand)] px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--brand)]"
        >
          Conectar
        </button>
      )}
    </div>
  );
}
