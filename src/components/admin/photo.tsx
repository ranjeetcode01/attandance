"use client";

import { useState } from "react";

export function Photo({ src, alt, size = 44 }: { src: string | null; alt: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400" style={{ width: size, height: size }}>
        {src ? "expired" : "no photo"}
      </div>
    );
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="shrink-0 overflow-hidden rounded-md ring-1 ring-line" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}
