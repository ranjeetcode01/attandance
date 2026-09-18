import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Flash, PageHeader } from "@/components/admin/bits";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { SiteForm } from "../site-form";

export const metadata: Metadata = { title: "Edit site" };

export default async function EditSitePage({ params, searchParams }: PageProps<"/admin/sites/[id]">) {
  await requireUser(["admin"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, Number(id)));
  if (!site) notFound();
  return (
    <>
      <BackLink href="/admin/projects">Projects & sites</BackLink>
      <PageHeader title={`Site: ${site.name}`} />
      <Flash searchParams={searchParams} />
      <SiteForm site={site} />
    </>
  );
}
