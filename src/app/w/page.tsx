import type { Metadata } from "next";
import { WorkerApp } from "@/components/worker/worker-app";

export const metadata: Metadata = { title: "Site app" };

// Static shell: all user data comes from /api/w/bootstrap, so the service
// worker can cache this page and open it without network.
export default function WorkerPage() {
  return <WorkerApp />;
}
