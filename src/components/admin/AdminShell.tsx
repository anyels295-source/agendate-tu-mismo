"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconPanel,
  IconAgenda,
  IconReservas,
  IconCalendarios,
  IconReportes,
  IconConfiguracion,
  IconGlobe,
  IconChevronDown,
  IconChevronUp,
  IconLogout,
  IconPlus,
} from "./icons";

type ProfessionalLite = { id: string; name: string; slug: string; serviceName: string; photoUrl: string | null };

const NAV = [
  { href: "/admin", label: "Panel", exact: true, Icon: IconPanel },
  { href: "/admin/agenda", label: "Agenda", Icon: IconAgenda },
  { href: "/admin/reservas", label: "Reservas", Icon: IconReservas },
  { href: "/admin/reportes", label: "Reportes", Icon: IconReportes },
  { href: "/admin/calendarios", label: "Calendarios", Icon: IconCalendarios },
  { href: "/admin/configuracion", label: "Configuración", Icon: IconConfiguracion },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "P";
}

// Colores decorativos de avatar: se mantienen fijos, no dependen del tema
// (igual que los estados de reservas), para que cada profesional conserve
// siempre el mismo color de identificación en la lista.
const PALETTE = [
  ["#dce6f1", "#1f3864"],
  ["#e4f6ec", "#1a7d45"],
  ["#f0e7fb", "#6b3fa0"],
  ["#fdf1dc", "#a4700f"],
  ["#e7effb", "#215a8f"],
];

function Avatar({
  professional,
  size,
  bg,
  fg,
  fontSize,
}: {
  professional: { name: string; photoUrl: string | null };
  size: number;
  bg: string;
  fg: string;
  fontSize: number;
}) {
  if (professional.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={professional.photoUrl}
        alt={professional.name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize }}
    >
      {initialsOf(professional.name)}
    </span>
  );
}

function ProfessionalMenu({
  professionals,
  activeId,
  onDone,
}: {
  professionals: ProfessionalLite[];
  activeId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function pick(id: string) {
    if (id === activeId) {
      onDone();
      return;
    }
    setSwitching(true);
    await fetch("/api/admin/professionals/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId: id }),
    });
    setSwitching(false);
    onDone();
    router.refresh();
  }

  return (
    <div className="rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_14px_40px_-12px_rgba(31,56,100,0.4)]">
      <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted-nav)]">
        Cambiar profesional
      </div>
      {professionals.map((p, i) => {
        const [bg, fg] = PALETTE[i % PALETTE.length];
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            disabled={switching}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left"
            style={{ background: active ? "var(--brand-soft)" : "var(--surface)" }}
          >
            <Avatar professional={p} size={30} bg={bg} fg={fg} fontSize={11.5} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold text-[var(--ink2)]">{p.name}</span>
              <span className="block text-[11px] text-[var(--muted-nav)]">{p.serviceName}</span>
            </span>
          </button>
        );
      })}
      <div className="my-1 h-px bg-[var(--line2)]" />
      <button className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[13px] font-semibold text-[var(--brand)]">
        <IconPlus />
        Agregar profesional
      </button>
    </div>
  );
}

export default function AdminShell({
  professionals,
  activeId,
  bookingUrl,
  theme,
  children,
}: {
  professionals: ProfessionalLite[];
  activeId: string;
  bookingUrl: string;
  theme: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [proOpen, setProOpen] = useState(false);
  const active = professionals.find((p) => p.id === activeId) ?? professionals[0];

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div id="agendate-shell" data-theme={theme} className="flex min-h-screen bg-[var(--page)] md:flex-row flex-col">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] p-[22px_16px] md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-[22px] pt-1">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--brand-lt)] to-[var(--brand-dk)] text-[16px] font-extrabold text-white">
            A
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold text-[var(--brand-dk)]">Agendate</div>
            <div className="text-[11px] font-medium text-[var(--muted-nav)]">Tú Mismo</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, exact, Icon }) => {
            const isOn = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-[14px] font-semibold"
                style={{ background: isOn ? "var(--brand-soft)" : "transparent", color: isOn ? "var(--brand-dk)" : "var(--muted-nav)" }}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="my-4 h-px bg-[var(--line2)]" />

        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-[11px] rounded-[10px] border border-[var(--brand-line)] bg-[var(--surface)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--brand)]"
        >
          <IconGlobe />
          Página pública
        </a>

        <div className="relative mt-auto">
          {proOpen && (
            <div className="absolute bottom-[54px] left-0 right-0 z-20">
              <ProfessionalMenu professionals={professionals} activeId={activeId} onDone={() => setProOpen(false)} />
            </div>
          )}
          <div className="flex items-center gap-2 px-1.5 pt-2.5">
            <button
              onClick={() => setProOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={proOpen}
              aria-label="Cambiar de profesional"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] p-1 text-left"
            >
              {active ? (
                <Avatar professional={active} size={34} bg="#dce6f1" fg="#1f3864" fontSize={13} />
              ) : (
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                  style={{ background: "#dce6f1", color: "#1f3864" }}
                >
                  P
                </span>
              )}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-bold text-[var(--ink2)]">{active?.name}</span>
                <span className="block truncate text-[11px] text-[var(--muted-nav)]">{active?.serviceName}</span>
              </span>
              {proOpen ? <IconChevronDown className="text-[var(--muted-nav)]" /> : <IconChevronUp className="text-[var(--muted-nav)]" />}
            </button>
            <button
              type="button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={async () => {
                await fetch("/api/auth/admin/logout", { method: "POST" });
                router.push("/admin/login");
                router.refresh();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--muted-nav)] hover:bg-[var(--page)]"
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar (mobile) */}
      <header className="sticky top-0 z-40 flex flex-col gap-2.5 border-b border-[var(--line)] bg-[var(--surface)] p-[12px_14px_10px] md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[var(--brand-lt)] to-[var(--brand-dk)] text-[15px] font-extrabold text-white">
            A
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14.5px] font-extrabold text-[var(--brand-dk)]">Agendate</div>
            <div className="text-[10.5px] font-medium text-[var(--muted-nav)]">Tú Mismo</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setProOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={proOpen}
              aria-label="Cambiar de profesional"
              className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1 pl-1 pr-2"
            >
              {active ? (
                <Avatar professional={active} size={28} bg="#dce6f1" fg="#1f3864" fontSize={11.5} />
              ) : (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11.5px] font-bold"
                  style={{ background: "#dce6f1", color: "#1f3864" }}
                >
                  P
                </span>
              )}
              <IconChevronDown className="text-[var(--muted-nav)]" />
            </button>
            {proOpen && (
              <div className="absolute right-0 top-[46px] z-20 w-[230px]">
                <ProfessionalMenu professionals={professionals} activeId={activeId} onDone={() => setProOpen(false)} />
              </div>
            )}
          </div>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5">
          {NAV.map(({ href, label, exact }) => {
            const isOn = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold"
                style={{
                  borderColor: isOn ? "var(--brand)" : "var(--line-in)",
                  background: isOn ? "var(--brand)" : "var(--surface)",
                  color: isOn ? "#fff" : "var(--ink4)",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
