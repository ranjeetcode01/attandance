"use client";

import Link from "next/link";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        The action could not be completed. If you were uploading a file, make sure it is under 500 KB.
        {error.digest && <span className="block pt-1 font-mono text-xs">Ref: {error.digest}</span>}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/admin" className="btn btn-secondary">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
