"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/admin/logout", { method: "POST" });
        router.push("/admin/login");
        router.refresh();
      }}
      className="text-sm text-gray-500 hover:text-gray-700"
    >
      Cerrar sesión
    </button>
  );
}
