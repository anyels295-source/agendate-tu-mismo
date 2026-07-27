"use client";

import { useState } from "react";

export default function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // portapapeles no disponible; no rompemos el flujo por esto.
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {copied ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}
