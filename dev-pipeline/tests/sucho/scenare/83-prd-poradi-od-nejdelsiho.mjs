// 83 · PRD · 1.5.0 pořadí „nejdelší první“ (spec 1.5.0 § 1.9): autoři částí od největšího odhadu, kontrola kostra první a pak
// části od největšího odhadu, zapracování a delta částí od největšího počtu nálezů. Strop souběhu Workflow (jádra − 2) řadí
// zbytek do fronty v pořadí volání; dlouhý agent na konci dávky prodlouží celou fázi.
import { argsPrd, kontrola, stub, CWD } from '../stuby.mjs'

const CASTI = [
  { id: 'K1', nazev: 'Malá', soubory: ['apps/a/**'], kriteria: ['AK1'], odhad_radku: 700, zavisi_na: [] },
  { id: 'K2', nazev: 'Velká', soubory: ['apps/b/**'], kriteria: ['AK2'], odhad_radku: 1400, zavisi_na: [] },
  { id: 'K3', nazev: 'Střední', soubory: ['apps/c/**'], kriteria: ['AK3'], odhad_radku: 1000, zavisi_na: [] },
]
const NALEZU = { K1: 3, K2: 2, K3: 4 }
const ids = n => Array.from({ length: n }, (_, i) => `N${i + 1}`)

export default {
  nazev: 'PRD: pořadí od nejdelšího agenta',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI, odhad_radku: 3100, kontrakt_potreba: false })
    const m = /^prd-check:řez 05:část (K\d):1$/.exec(label)
    if (m) return { verdikt: 'needs-fixes', nalezu: NALEZU[m[1]], blokujicich: 2, osy: ['B'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-cast-${m[1]}-kolo-1.md`, nalezy_ids: ids(NALEZU[m[1]]) }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const poradi = (labely, co) => {
      const xs = labely.map(l => k.jeden(l))
      if (xs.every(Boolean)) k.ok(xs.every((x, i) => i === 0 || xs[i - 1].start < x.start), `${co}: start v pořadí ${xs.map(x => `${x.label}@${x.start}`).join(', ')}`)
    }
    poradi(['prd-část:řez 05:K2', 'prd-část:řez 05:K3', 'prd-část:řez 05:K1'], 'autoři od největšího odhadu')
    poradi(['prd-check:řez 05:1', 'prd-check:řez 05:část K2:1', 'prd-check:řez 05:část K3:1', 'prd-check:řez 05:část K1:1'], 'kontrola: kostra a části od největšího odhadu')
    poradi(['prd-fix:řez 05:část K3', 'prd-fix:řez 05:část K1', 'prd-fix:řez 05:část K2'], 'zapracování částí od největšího počtu nálezů')
    poradi(['prd-check:řez 05:část K3:2', 'prd-check:řez 05:část K1:2', 'prd-check:řez 05:část K2:2'], 'delta částí od největšího počtu nálezů')
    k.vsechnySoubezne(['prd-část:řez 05:K1', 'prd-část:řez 05:K2', 'prd-část:řez 05:K3'].map(l => volani.find(x => x.label === l)), 'autoři souběžně')
    // Výsledky se párují s částmi podle id, ne podle pořadí startu.
    k.rovno((v && v.casti || []).map(c => [c.id, c.odhad_radku]), CASTI.map(c => [c.id, c.odhad_radku]), 'návrat.casti v pořadí architekta')
    return k.chyby
  },
}
