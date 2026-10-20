import { InboxScreen } from "@/components/inbox/InboxScreen";

// The signed-in member's own WhatsApp: link it, then their conversations.
export default function PersonalWhatsAppPage() {
  return <InboxScreen box="personal" basePath="/my-whatsapp" />;
}
