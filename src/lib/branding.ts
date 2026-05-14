export const DEFAULT_ACCENT = '#F4622A'

const RESERVED_SLUGS = new Set([
  'dashboard', 'customers', 'login', 'settings', 'meal-plans',
  'menu', 'payments', 'summary', 'c', 'api', 'auth', 'admin',
  'app', 'www', 'help', 'support', 'about', 'contact',
])

export function validateSlug(slug: string): string | null {
  const s = slug.trim().toLowerCase()
  if (s.length < 3) return 'At least 3 characters required'
  if (s.length > 30) return 'Maximum 30 characters'
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s))
    return 'Only lowercase letters, numbers, and hyphens (not at start/end)'
  if (RESERVED_SLUGS.has(s)) return `"${s}" is reserved`
  return null
}

export function safeAccentColor(color: string | null | undefined): string {
  if (!color) return DEFAULT_ACCENT
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return DEFAULT_ACCENT
  return color
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))) }

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

export function darkenHex(hex: string, by: number) {
  const [r, g, b] = hexToRgb(hex)
  return toHex(r - by, g - by, b - by)
}

export function getThemeVars(accentColor: string | null | undefined): Record<string, string> {
  const accent = safeAccentColor(accentColor)
  const [r, g, b] = hexToRgb(accent)
  return {
    '--accent': accent,
    '--accent-dark': darkenHex(accent, 22),
    '--accent-rgb': `${r} ${g} ${b}`,
  }
}

// Returns true if white text has WCAG AA contrast on this background
export function needsLightText(hex: string): boolean {
  const [r, g, b] = hexToRgb(safeAccentColor(hex))
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return (1.05 / (L + 0.05)) >= 4.5
}
