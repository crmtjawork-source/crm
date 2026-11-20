"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { apiPost } from "./api";
import { useStore } from "./store";
import { DEFAULT_MATCHING, normalizeConfig, type MatchingConfig } from "./matching";

// Per-org matching config. Read separately from the main store so a missing
// column (migration not applied yet) can never break the app.
export function useMatchingConfig() {
  const { orgId } = useStore();
  const [config, setConfig] = useState<MatchingConfig>(DEFAULT_MATCHING);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase.from("organizations").select("matching_config").eq("id", orgId).maybeSingle();
    if (error) setAvailable(false);
    else setConfig(normalizeConfig(data?.matching_config));
    setReady(true);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("matching_config")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setAvailable(false);
        else setConfig(normalizeConfig(data?.matching_config));
        setReady(true);
      });
  }, [orgId]);

  const save = useCallback(async (next: MatchingConfig) => {
    await apiPost("/api/org/settings", { matchingConfig: next });
    setConfig(next);
  }, []);

  return { config, ready, available, save, reload: load };
}
