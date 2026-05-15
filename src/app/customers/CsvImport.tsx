'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generateCustomerToken } from '@/lib/customer-token'
import {
  X, Upload, FileText, CheckCircle2, AlertTriangle, Download, ArrowRight, Loader2,
} from 'lucide-react'

// ── Column aliases (loosely matched) ─────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  name:         ['name', 'customer name', 'customer', 'full name', 'cust name', 'naam', 'client name'],
  phone:        ['phone', 'mobile', 'whatsapp', 'phone number', 'mobile number', 'contact', 'number', 'mob', 'ph', 'cell'],
  address:      ['address', 'full address', 'delivery address', 'addr', 'street', 'flat', 'home address'],
  area:         ['area', 'locality', 'zone', 'sector', 'neighbourhood', 'location', 'colony', 'society', 'neighbourhood'],
  plan_type:    ['plan type', 'preference', 'diet', 'type', 'food type', 'plan', 'veg/nonveg', 'veg nonveg', 'diet type'],
  balance_days: ['balance', 'balance days', 'days', 'prepaid days', 'days remaining', 'remaining days', 'paid days'],
  notes:        ['notes', 'note', 'remarks', 'comment', 'remark', 'remarks/notes', 'comments'],
}

function matchColumn(header: string): string | null {
  const h = header.trim().toLowerCase()
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(a => h === a || h.includes(a) || a.includes(h))) return field
  }
  return null
}

function parsePlanType(raw: string): 'veg' | 'nonveg' | null {
  const v = raw.trim().toLowerCase()
  if (['veg', 'v', 'vegetarian', 'pure veg'].includes(v)) return 'veg'
  if (['nonveg', 'non-veg', 'non veg', 'nv', 'non vegetarian', 'non-vegetarian', 'both'].includes(v)) return 'nonveg'
  return null
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function detectDelimiter(line: string): string {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of line) {
    if (ch in counts) counts[ch as keyof typeof counts]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  name: string
  phone: string
  address: string
  area: string
  plan_type: 'veg' | 'nonveg' | null
  balance_days: number
  notes: string
  error: string | null
  raw: Record<string, string>
}

interface Props {
  providerId: string
  onClose: () => void
  onImported: (count: number) => void
}

// ── Sample CSV ────────────────────────────────────────────────────────────────

const SAMPLE_CSV = `Name,Phone,Area,Address,Preference,Balance Days,Notes
Priya Sharma,9876543210,Andheri West,Flat 4B Lotus Apts,Veg,30,Near the gate
Rahul Mehta,9123456789,Bandra,201 Sea View,Non-veg,15,
Sunita Patel,9988776655,Juhu,A-12 Palm Court,Veg,20,Lunch only
`

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dabbr_customers_sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CsvImport({ providerId, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [importedCount, setImportedCount] = useState(0)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  const validRows = rows.filter(r => !r.error)
  const errorRows = rows.filter(r => r.error)

  function parseFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      alert('Please upload a .csv file.')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return }

      const delimiter = detectDelimiter(lines[0])
      const headers = parseCsvLine(lines[0], delimiter)

      // Map each header → field name
      const map: Record<string, string> = {}
      headers.forEach((h, i) => {
        const field = matchColumn(h)
        if (field) map[i.toString()] = field
      })
      setColumnMap(map)

      const parsed: ParsedRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i], delimiter)
        const raw: Record<string, string> = {}
        headers.forEach((h, j) => { raw[h] = cells[j] ?? '' })

        const get = (field: string) => {
          const idx = Object.entries(map).find(([, f]) => f === field)?.[0]
          return idx !== undefined ? (cells[parseInt(idx)] ?? '').trim() : ''
        }

        const name = get('name')
        const rawPhone = get('phone')
        const phone = normalizePhone(rawPhone)
        const address = get('address')
        const area = get('area')
        const planTypeRaw = get('plan_type')
        const plan_type = planTypeRaw ? parsePlanType(planTypeRaw) : null
        const balanceRaw = get('balance_days')
        const balance_days = balanceRaw ? Math.max(0, parseInt(balanceRaw) || 0) : 0
        const notes = get('notes')

        let error: string | null = null
        if (!name) error = 'Missing name'
        else if (!phone || phone.length !== 10) error = 'Invalid phone number'

        parsed.push({ name, phone, address, area, plan_type, balance_days, notes, error, raw })
      }

      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  async function handleImport() {
    setStep('importing')
    const errors: string[] = []
    let count = 0

    for (const row of validRows) {
      try {
        // Insert customer
        const { data: customer, error: custErr } = await db
          .from('customers')
          .insert({
            provider_id: providerId,
            name: row.name,
            whatsapp_number: row.phone,
            address: row.address || null,
            area: row.area || null,
            plan_type: row.plan_type ?? 'veg',
            balance_days: row.balance_days,
            notes: row.notes || null,
            status: 'active',
            frequency: 'daily',
            meal_slots: ['lunch'],
          })
          .select('id')
          .single()

        if (custErr || !customer) {
          errors.push(`${row.name}: ${custErr?.message ?? 'Insert failed'}`)
          continue
        }

        // Generate access token
        const token = generateCustomerToken()
        await db.from('customer_access_tokens').insert({
          customer_id: customer.id,
          provider_id: providerId,
          token,
          is_active: true,
        })

        count++
      } catch (err: unknown) {
        errors.push(`${row.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    setImportedCount(count)
    setImportErrors(errors)
    setStep('done')
    if (count > 0) onImported(count)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-lg bg-[#FDF8F3] rounded-t-[2rem] sm:rounded-[2rem] max-h-[92vh] flex flex-col shadow-2xl">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-black text-gray-900">Import Customers</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {step === 'upload' && 'Upload a CSV file'}
              {step === 'preview' && `${rows.length} rows found · ${validRows.length} ready`}
              {step === 'importing' && 'Importing…'}
              {step === 'done' && `${importedCount} customers added`}
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <>
              {/* Instructions */}
              <div className="rounded-2xl bg-white border border-gray-100 px-4 py-4 space-y-3 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">How to prepare your CSV</p>
                <div className="space-y-2">
                  {[
                    ['Name', 'Customer\'s full name', true],
                    ['Phone', '10-digit mobile number', true],
                    ['Area', 'Delivery area or locality', false],
                    ['Address', 'Full delivery address', false],
                    ['Preference', 'Veg or Non-veg', false],
                    ['Balance Days', 'Prepaid days remaining', false],
                    ['Notes', 'Any delivery notes', false],
                  ].map(([col, desc, req]) => (
                    <div key={col as string} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                        req ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {req ? 'Required' : 'Optional'}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-gray-800">{col as string}</span>
                        <span className="text-xs text-gray-400"> — {desc as string}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed pt-1 border-t border-gray-50">
                  Column names don&apos;t need to match exactly — we&apos;ll detect them automatically.
                  Your spreadsheet app can export as CSV via <span className="font-semibold">File → Download → CSV</span>.
                </p>
              </div>

              {/* Download sample */}
              <button
                onClick={downloadSample}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-200 bg-orange-50 py-3 text-xs font-bold text-orange-600 hover:bg-orange-100 transition-colors active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" />
                Download sample CSV
              </button>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
                  dragOver
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                }`}
              >
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-600">Drop your CSV here</p>
                <p className="text-xs text-gray-400 mt-1">or tap to browse</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileInput} />
              </div>
            </>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <>
              {/* Column mapping summary */}
              <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Detected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(columnMap).map(field => (
                    <span key={field} className="rounded-full bg-green-50 border border-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">
                      ✓ {field.replace('_', ' ')}
                    </span>
                  ))}
                  {!Object.values(columnMap).includes('plan_type') && (
                    <span className="rounded-full bg-gray-50 border border-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-400">
                      preference → defaults to Veg
                    </span>
                  )}
                </div>
              </div>

              {/* Error rows */}
              {errorRows.length > 0 && (
                <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                  <p className="text-xs font-black text-red-700 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {errorRows.length} row{errorRows.length > 1 ? 's' : ''} will be skipped
                  </p>
                  <div className="space-y-1">
                    {errorRows.slice(0, 5).map((r, i) => (
                      <p key={i} className="text-[11px] text-red-600">
                        <span className="font-bold">{r.name || '(no name)'}</span> — {r.error}
                      </p>
                    ))}
                    {errorRows.length > 5 && (
                      <p className="text-[11px] text-red-400">…and {errorRows.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Valid rows preview */}
              {validRows.length > 0 && (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-4 pt-3 pb-2">
                    Preview ({validRows.length} customers)
                  </p>
                  <div className="divide-y divide-gray-50">
                    {validRows.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-7 h-7 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-black text-orange-600">{r.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{r.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {r.phone}
                            {r.area && ` · ${r.area}`}
                            {r.plan_type && ` · ${r.plan_type}`}
                            {r.balance_days > 0 && ` · ${r.balance_days}d`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {validRows.length > 8 && (
                      <div className="px-4 py-2.5 text-[11px] text-gray-400 font-medium">
                        + {validRows.length - 8} more customers
                      </div>
                    )}
                  </div>
                </div>
              )}

              {validRows.length === 0 && (
                <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-6 text-center">
                  <p className="text-sm font-bold text-amber-700">No valid rows found</p>
                  <p className="text-xs text-amber-600 mt-1">Check that your CSV has Name and Phone columns.</p>
                </div>
              )}
            </>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-black text-gray-800">Importing customers…</p>
                <p className="text-xs text-gray-400 mt-1">Creating records and access links</p>
              </div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-20 h-20 rounded-3xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-black text-gray-900">{importedCount} customers added!</p>
                <p className="text-sm text-gray-400 mt-1">
                  Access links have been generated for each one.
                </p>
              </div>
              {importErrors.length > 0 && (
                <div className="w-full rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-left">
                  <p className="text-xs font-black text-red-700 mb-1.5">{importErrors.length} failed</p>
                  {importErrors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[11px] text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100 shrink-0 space-y-2">
          {step === 'upload' && (
            <p className="text-center text-[11px] text-gray-400">
              <FileText className="w-3 h-3 inline mr-1" />
              Works with Excel, Google Sheets, or any CSV file
            </p>
          )}

          {step === 'preview' && validRows.length > 0 && (
            <button
              onClick={handleImport}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Import {validRows.length} customers
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 'preview' && (
            <button
              onClick={() => { setStep('upload'); setRows([]); setFileName('') }}
              className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              ← Upload a different file
            </button>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg active:scale-[0.98] transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
