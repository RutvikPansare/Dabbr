'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Search, UserCheck, Phone, Users, AlertTriangle, Check, Loader2 } from 'lucide-react'

interface ContactEntry {
  id: string
  name: string
  phone: string          // normalised 10-digit
  phoneRaw: string       // as returned by OS
  selected: boolean
}

interface Props {
  providerId: string
  mealPlanId: string     // default plan to assign
  onImport: (contacts: { name: string; phone: string }[]) => Promise<void>
  onClose: () => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Strip country code prefixes: +91, 91, 0
  const stripped = digits.replace(/^(\+?91|0)(\d{10})$/, '$2')
  return stripped.length === 10 ? stripped : digits
}

function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone)
}

// ── Main component ───────────────────────────────────────────────────────────

type Step = 'loading' | 'error' | 'list' | 'importing' | 'done'

export default function ContactsImport({ onImport, onClose }: Props) {
  const [step, setStep] = useState<Step>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [contacts, setContacts] = useState<ContactEntry[]>([])
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  // ── Load contacts on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    setStep('loading')
    try {
      // Check if running inside Capacitor (native Android app)
      const isNative = !!(window as any).Capacitor?.isNativePlatform?.()

      if (isNative) {
        await loadNativeContacts()
      } else {
        // Web Contact Picker API (Chrome Android browser)
        if ('contacts' in navigator && 'ContactsManager' in window) {
          await loadWebContacts()
        } else {
          setErrorMsg('Contact access requires the Dabbr Android app. On the web, please use CSV import instead.')
          setStep('error')
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Could not load contacts.')
      setStep('error')
    }
  }

  async function loadNativeContacts() {
    // turbopackIgnore + webpackIgnore: skip static analysis — this package
    // is only available at runtime inside native Capacitor iOS/Android apps.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Contacts } = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@capacitor-community/contacts' as any)

    // Request permission
    const { contacts: permResult } = await Contacts.requestPermissions()
    if (permResult !== 'granted') {
      setErrorMsg('Contacts permission was denied. Please allow it in your phone\'s Settings → Apps → Dabbr → Permissions.')
      setStep('error')
      return
    }

    const { contacts: rawContacts } = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      },
    })

    const entries = buildEntries(
      (rawContacts ?? []).map((c: any) => ({
        name: c.name?.display ?? c.name?.given ?? '',
        phones: (c.phones ?? []).map((p: any) => p.number ?? ''),
      }))
    )

    setContacts(entries)
    setStep('list')
  }

  async function loadWebContacts() {
    // Web Contact Picker API — only available on Chrome Android
    const props = ['name', 'tel']
    const opts = { multiple: true }
    const results = await (navigator as any).contacts.select(props, opts)

    const entries = buildEntries(
      (results ?? []).map((c: any) => ({
        name: Array.isArray(c.name) ? c.name[0] : (c.name ?? ''),
        phones: Array.isArray(c.tel) ? c.tel : [c.tel ?? ''],
      }))
    )

    setContacts(entries)
    setStep('list')
  }

  function buildEntries(raw: { name: string; phones: string[] }[]): ContactEntry[] {
    const seen = new Set<string>()
    const entries: ContactEntry[] = []

    for (const c of raw) {
      const name = c.name.trim()
      if (!name) continue

      // Pick the first valid Indian mobile number
      let bestPhone = ''
      let bestRaw = ''
      for (const ph of c.phones) {
        const norm = normalisePhone(ph)
        if (isValidIndianMobile(norm)) {
          bestPhone = norm
          bestRaw = ph
          break
        }
        if (!bestRaw && ph.trim()) {
          bestPhone = normalisePhone(ph)
          bestRaw = ph
        }
      }

      if (!bestRaw) continue // no phone at all — skip

      // Deduplicate by phone
      if (seen.has(bestPhone)) continue
      seen.add(bestPhone)

      entries.push({
        id: `${name}-${bestPhone}`,
        name,
        phone: bestPhone,
        phoneRaw: bestRaw,
        selected: false,
      })
    }

    // Sort: valid mobile numbers first, then alphabetically
    return entries.sort((a, b) => {
      const aValid = isValidIndianMobile(a.phone)
      const bValid = isValidIndianMobile(b.phone)
      if (aValid !== bValid) return aValid ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? contacts.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      : contacts
  }, [contacts, search])

  const selectedCount = contacts.filter(c => c.selected).length
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => c.selected)

  function toggleContact(id: string) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c))
  }

  function toggleAll() {
    const ids = new Set(filtered.map(c => c.id))
    setContacts(prev => prev.map(c => ids.has(c.id) ? { ...c, selected: !allFilteredSelected } : c))
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    const selected = contacts.filter(c => c.selected)
    if (!selected.length) return
    setImporting(true)
    await onImport(selected.map(c => ({ name: c.name, phone: c.phone })))
    setImportedCount(selected.length)
    setImporting(false)
    setStep('done')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl sm:mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100">
            <Users className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900">Import from Contacts</p>
            {step === 'list' && (
              <p className="text-xs font-medium text-gray-400">
                {contacts.length} contacts found · {selectedCount} selected
              </p>
            )}
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Loading contacts…</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="p-5">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Cannot access contacts</p>
                  <p className="text-xs font-medium text-amber-700 mt-1">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
                <UserCheck className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-base font-black text-green-700">{importedCount} customer{importedCount !== 1 ? 's' : ''} imported!</p>
              <button onClick={onClose} className="mt-2 rounded-2xl bg-orange-500 px-6 py-3 text-sm font-bold text-white active:scale-95 transition-all">
                Done
              </button>
            </div>
          )}

          {/* Contact list */}
          {step === 'list' && (
            <div>
              {/* Search + select all */}
              <div className="px-4 pt-3 pb-2 space-y-2 sticky top-0 bg-white z-10 border-b border-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or number…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
                {filtered.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs font-bold text-orange-600 active:scale-95 transition-all"
                  >
                    <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${allFilteredSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                      {allFilteredSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
                  </button>
                )}
              </div>

              {/* Contacts */}
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-gray-400">No contacts match</p>
                </div>
              ) : (
                <div>
                  {filtered.map((c, i) => {
                    const valid = isValidIndianMobile(c.phone)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleContact(c.id)}
                        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors active:bg-orange-50 ${
                          i !== filtered.length - 1 ? 'border-b border-gray-50' : ''
                        } ${c.selected ? 'bg-orange-50/60' : ''}`}
                      >
                        {/* Checkbox */}
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                          c.selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                        }`}>
                          {c.selected && <Check className="w-3 h-3 text-white" />}
                        </div>

                        {/* Avatar */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-black text-gray-500">
                          {c.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                            <p className={`text-xs font-medium truncate ${valid ? 'text-gray-500' : 'text-amber-600'}`}>
                              {c.phone}
                              {!valid && ' · not a mobile'}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'list' && (
          <div className="px-5 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleImport}
              disabled={selectedCount === 0 || importing}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white shadow-sm disabled:bg-gray-200 disabled:text-gray-400 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {importing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                : selectedCount === 0
                ? 'Select contacts to import'
                : `Import ${selectedCount} customer${selectedCount !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
