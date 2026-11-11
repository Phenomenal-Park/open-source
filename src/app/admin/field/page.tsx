import { redirect } from "next/navigation";
import { getAdminCaller } from "@/lib/server/auth";
import { FieldApp } from "@/components/admin/FieldApp";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  if (!(await getAdminCaller())) redirect("/admin/login");
  return <FieldApp mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} />;
}
