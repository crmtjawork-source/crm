import { InboxScreen } from "@/components/inbox/InboxScreen";

// The business's WhatsApp conversations (shared number / official API).
export default function BusinessWhatsAppPage() {
  return <InboxScreen box="business" basePath="/inbox" />;
}
