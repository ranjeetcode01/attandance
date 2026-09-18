"use client";

import { useState } from "react";

// Company logo. Falls back to a neutral (unbranded) app mark when there is no logo
// or the image fails to load. Callers set the size, including any max-width.
export function BrandLogo({ src, alt, className = "h-10" }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <GenericMark label={alt} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(src)} className={`${className} w-auto shrink-0 object-contain`} />
  );
}

function GenericMark({ label, className }: { label: string; className: string }) {
  return (
    <span role="img" aria-label={label} className={`${className} inline-flex aspect-square w-auto shrink-0 items-center justify-center rounded-lg bg-brand text-white`}>
      <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    </span>
  );
}
