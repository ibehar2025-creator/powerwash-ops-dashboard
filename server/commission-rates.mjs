export const pressureWashingCommissionPct = 0.31;
export const windowWashingCommissionPct = 0.22;

export function serviceCommissionCategory(serviceType) {
  const normalized = String(serviceType ?? "").trim().toLowerCase();
  if (!normalized) return "other";
  if (normalized.includes("window")) return "window-washing";
  if (/pressure|power\s*wash|driveway|sidewalk|walkway|patio|paver|concrete|house wash|soft wash/.test(normalized)) {
    return "pressure-washing";
  }
  return "other";
}

export function commissionRateForService(serviceType, profile) {
  const category = serviceCommissionCategory(serviceType);
  if (category === "pressure-washing") {
    return Number(profile.pressure_washing_commission_pct ?? profile.pressureWashingCommissionPct ?? profile.base_commission_pct ?? profile.baseCommissionPct ?? 0);
  }
  if (category === "window-washing") {
    return Number(profile.window_washing_commission_pct ?? profile.windowWashingCommissionPct ?? profile.base_commission_pct ?? profile.baseCommissionPct ?? 0);
  }
  return Number(profile.base_commission_pct ?? profile.baseCommissionPct ?? 0);
}
