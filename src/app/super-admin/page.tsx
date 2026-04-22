import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { SuperAdminLoginForm } from "./login-form";

export const metadata = {
  title: "Super-admin login",
  // Stay out of search indexes.
  robots: { index: false, follow: false },
};

export default async function SuperAdminLoginPage() {
  // Already logged in → dashboard
  const session = await getSuperAdminSession();
  if (session) {
    redirect("/super-admin/dashboard");
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Super-admin
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
            Enter your email to receive a login code.
          </p>
        </div>

        <SuperAdminLoginForm />

        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          Restricted access.
        </p>
      </div>
    </main>
  );
}
