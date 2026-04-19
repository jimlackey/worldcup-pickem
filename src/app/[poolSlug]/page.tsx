import { redirect } from "next/navigation";

interface PoolHomeProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function PoolHome({ params }: PoolHomeProps) {
  const { poolSlug } = await params;
  // Pool home just redirects to standings (the main public view)
  redirect(`/${poolSlug}/standings`);
}
