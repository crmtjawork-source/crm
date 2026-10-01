// Must stay identical to the SQL function normalize_phone() in
// supabase/migrations/20260923000000_messaging_and_lead_ads.sql — the
// generated contacts.phone_digits column is built with the SQL version and
// looked up with this one.
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (/^0\d{8,9}$/.test(digits)) return `972${digits.slice(1)}`;
  return digits;
}
