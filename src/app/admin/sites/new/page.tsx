import type { Metadata } from "next";
import { BackLink, Flash, intParam, PageHeader } from "@/components/admin/bits";
import { requireUser } from "@/lib/auth";
import { SiteForm } from "../site-form";

export const metadata: Metadata = { title: "New site" };

export default async function NewSitePage({ searchParams }: PageProps<"/admin/sites/new">) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  return (
    <>
      <BackLink href="/admin/projects">Projects & sites</BackLink>
      <PageHeader title="New site" subtitle="Stand at the site and use “Use my current location”, or click the map." />
      <Flash searchParams={searchParams} />
      <SiteForm projectId={intParam(sp.project)} />
    </>
  );
}
