"use client";

import { useState } from "react";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";

const MAX_BYTES = 500 * 1024;

// Checks the size in the browser so a large photo never reaches the server
// (server actions reject bodies over 1 MB with a generic error page).
export function LogoUploadForm({ action }: { action: (form: FormData) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        const input = e.currentTarget.elements.namedItem("logo") as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (file && file.size > MAX_BYTES) {
          e.preventDefault();
          setError(`This file is ${Math.round(file.size / 1024)} KB. Please use a logo under 500 KB (resize or export as PNG/WEBP).`);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="logo">
          Upload logo — PNG / JPG / WEBP, max 500 KB, transparent or white background
        </label>
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="input py-1.5"
          onChange={() => setError(null)}
        />
      </div>
      <ConfirmSubmit>Upload</ConfirmSubmit>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
