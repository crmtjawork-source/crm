// The list the user opened a lead from (leads list, pipeline table, a kanban
// column…), in order — so the lead card can step to the previous / next lead
// of that same list. Kept per tab.
const KEY = "crm-lead-nav";

export function setLeadNav(ids: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids.slice(0, 5000)));
  } catch {
    // storage unavailable — no previous / next, nothing else breaks
  }
}

export function getLeadNav(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
