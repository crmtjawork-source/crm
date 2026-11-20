"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { mapItem, mapSchedule, type PaymentSchedule } from "@/lib/payments";

// Payment schedules (with their payments), optionally of one lead.
export function usePayments(contactId?: string) {
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    let sq = supabase.from("payment_schedules").select("*").order("created_at", { ascending: false }).limit(1000);
    let iq = supabase.from("payment_items").select("*").order("position").limit(5000);
    if (contactId) {
      sq = sq.eq("contact_id", contactId);
      iq = iq.eq("contact_id", contactId);
    }
    const [s, i] = await Promise.all([sq, iq]);
    if (s.error || i.error) setError((s.error ?? i.error)!.message);
    else {
      setError("");
      const items = (i.data ?? []).map(mapItem);
      setSchedules((s.data ?? []).map((r) => mapSchedule(r, items)));
    }
    setLoading(false);
  }, [contactId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);
  return { schedules, loading, error, reload };
}
