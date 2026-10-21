import { redirect } from "next/navigation";

// The settings area opens on its first page; the sidebar has the rest.
export default function SettingsIndex() {
  redirect("/settings/notifications");
}
