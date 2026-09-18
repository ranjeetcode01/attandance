"use client";

import { useFormStatus } from "react-dom";

// Submit button that asks for confirmation and shows a pending state.
export function ConfirmSubmit({ children, confirmText, className = "btn btn-primary", name, value }: { children: React.ReactNode; confirmText?: string; className?: string; name?: string; value?: string }) {
  const { pending, data } = useFormStatus();
  // In forms with several named buttons, only the one that was clicked shows the busy label.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button
      className={className}
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      {mine ? "Working…" : children}
    </button>
  );
}
