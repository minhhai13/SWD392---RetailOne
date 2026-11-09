/** Page numbers with ellipsis: 1 … 4 5 [6] 7 8 … 20 */
export const pageWindow = (page, totalPages, radius = 2) => {
  const pages = new Set([1, totalPages])
  for (let p = page - radius; p <= page + radius; p += 1) if (p >= 1 && p <= totalPages) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`)
    out.push(p)
  })
  return out
}

