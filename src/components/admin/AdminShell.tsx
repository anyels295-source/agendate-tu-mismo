"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconPanel,
  IconAgenda,
  IconReservas,
  IconCalendarios,
  IconConfiguracion,
  IconGlobe,
  IconChevronDown,
  IconChevronUp,
  IconLogout,
  IconPlus,
} from "./icons";

type ProfessionalLite = { id: string; name: string; slug: string; serviceName: string };

const NAV = [
  { href: "/admin", label: "Panel", exact: true, Icon: IconPanel },
  { href: "/admin/agenda", label: "Agenda", Icon: IconAgenda },
  { href: "/admin/reservas", label: "Reservas", Icon: IconReservas },
  { href: "/admin/calendarios", label: "Calendarios", Icon: IconCalendarios },
  { href: "/admin/configuracion", label: "Configuración", Icon: IconConfiguracion },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "P";
}

const PALETTE = [
  ["#dce6f1", "#1f3864"],
  ["#e4f6ec", "#1a7d45"],
  ["#f0e7fb", "#6b3fa0"],
  ["#fdf1dc", "#a4700f"],
  ["#e7effb", "#215a8f"],
];

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
    <div className="rounded-[13px] border border-[#e7ecf4] bg-white p-1.5 shadow-[0_14px_40px_-12px_rgba(31,56,100,0.4)]">
      <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#6b7280]">
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
            style={{ background: active ? "#eef4fb" : "#fff" }}
          >
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
              style={{ background: bg, color: fg }}
            >
              {initialsOf(p.name)}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold text-[#2a3856]">{p.name}</span>
              <span className="block text-[11px] text-[#6b7280]">{p.serviceName}</span>
            </span>
          </button>
        );
      })}
      <div className="my-1 h-px bg-[#eef1f7]" />
      <button className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[13px] font-semibold text-[#215a8f]">
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
  children,
}: {
  professionals: ProfessionalLite[];
  activeId: string;
  bookingUrl: string;
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
    <div className="flex min-h-screen bg-[#f4f7fb] md:flex-row flex-col">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col overflow-y-auto border-r border-[#e7ecf4] bg-white p-[22px_16px] md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-[22px] pt-1">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#2e74b5] to-[#1f3864] text-[16px] font-extrabold text-white">
            A
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold text-[#1f3864]">Agendate</div>
            <div className="text-[11px] font-medium text-[#6b7280]">Tú Mismo</div>
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
                style={{ background: isOn ? "#eef4fb" : "transparent", color: isOn ? "#1f3864" : "#64708a" }}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="my-4 h-px bg-[#eef1f7]" />

        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-[11px] rounded-[10px] border border-[#d6e2f0] bg-white px-3 py-2.5 text-[13.5px] font-semibold text-[#215a8f]"
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
              <span
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                style={{ background: "#dce6f1", color: "#1f3864" }}
              >
                {active ? initialsOf(active.name) : "P"}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-bold text-[#2a3856]">{active?.name}</span>
                <span className="block truncate text-[11px] text-[#6b7280]">{active?.serviceName}</span>
              </span>
              {proOpen ? <IconChevronDown className="text-[#6b7280]" /> : <IconChevronUp className="text-[#6b7280]" />}
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[#6b7280] hover:bg-[#f4f7fb]"
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar (mobile) */}
      <header className="sticky top-0 z-40 flex flex-col gap-2.5 border-b border-[#e7ecf4] bg-white p-[12px_14px_10px] md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#2e74b5] to-[#1f3864] text-[15px] font-extrabold text-white">
            A
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14.5px] font-extrabold text-[#1f3864]">Agendate</div>
            <div className="text-[10.5px] font-medium text-[#6b7280]">Tú Mismo</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setProOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={proOpen}
              aria-label="Cambiar de profesional"
              className="flex items-center gap-1.5 rounded-full border border-[#e7ecf4] bg-white py-1 pl-1 pr-2"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11.5px] font-bold"
                style={{ background: "#dce6f1", color: "#1f3864" }}
              >
                {active ? initialsOf(active.name) : "P"}
              </span>
              <IconChevronDown className="text-[#6b7280]" />
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
                  borderColor: isOn ? "#215a8f" : "#e0e6f0",
                  background: isOn ? "#215a8f" : "#fff",
                  color: isOn ? "#fff" : "#4a5878",
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
