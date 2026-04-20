export function recommendOspfCost(bandwidthMbps: number | null | undefined) {
  if (!bandwidthMbps || bandwidthMbps <= 0) {
    return 100
  }

  return Math.max(1, Math.min(65535, Math.round(100000 / bandwidthMbps)))
}
