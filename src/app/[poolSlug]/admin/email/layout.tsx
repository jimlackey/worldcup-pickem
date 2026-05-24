import { EmailSubNav } from "./email-sub-nav";

interface EmailLayoutProps {
  children: React.ReactNode;
  params: Promise<{ poolSlug: string }>;
}

/**
 * Shared frame for `/{poolSlug}/admin/email/*` pages. Renders the
 * sub-nav (Send Email / Manage Widgets) once and lets each child page
 * provide its own body underneath.
 *
 * Auth is NOT re-checked here — the parent admin layout
 * (`/{poolSlug}/admin/layout.tsx`) already gates the whole admin
 * subtree on `session.role === "admin"`. Re-doing the check here would
 * double the work without adding any guarantee.
 *
 * The layout intentionally does NOT add an h1/h2 — the parent admin
 * layout owns the top-level "Admin Panel" heading, and each child page
 * provides its own page-level h2 (Email Players / Manage Email Widgets)
 * so each tab keeps its own self-contained heading.
 */
export default async function EmailLayout({
  children,
  params,
}: EmailLayoutProps) {
  const { poolSlug } = await params;

  return (
    <div className="space-y-4">
      <EmailSubNav poolSlug={poolSlug} />
      {children}
    </div>
  );
}
