// 135 · PRD · 1.7.0 texty zadání (spec 1.7.0 § 1.1, 1.2, 1.6, 1.9; rozbor-prd návrhy 3, 7, 8): sdílené pravidlo čekání na čas
// a cekani, kroky před nasazením implementaci, podmíněný krok s nevztahuje-se, kritérium s názvem, návrh ověřuje kontrola,
// odhad architekta bývá poloviční (od 1.9.0 „2×“; rozdělit nad ~8 k), nejdelší cesta závislostí v kontrole kostry, pravidla běhu po sekcích
// a rozhodnutí majitele v rámci.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const CASTI = [
  { id: 'K1', nazev: 'Evidence', soubory: ['packages/db/evidence/**'], kriteria: ['AK1'], odhad_radku: 700, zavisi_na: [] },
  { id: 'K2', nazev: 'Runner', soubory: ['apps/api/runner/**'], kriteria: ['AK2'], odhad_radku: 600, zavisi_na: ['K1'] },
  { id: 'K3', nazev: 'Soud', soubory: ['apps/api/soud/**'], kriteria: ['AK3'], odhad_radku: 750, zavisi_na: ['K2'] },
  { id: 'K4', nazev: 'UI', soubory: ['apps/web/naklady/**'], kriteria: ['AK4'], odhad_radku: 500, zavisi_na: [] },
]
const ROZH = ['2026-10-06 12:50 Bez čekání']

export default {
  nazev: 'PRD: texty zadání 1.7.0',
  blok: 'blok-prd',
  args: argsPrd({ rozhodnuti_majitele: ROZH }),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 4, casti: CASTI, odhad_radku: 2550, kontrakt_potreba: true })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    // 1.8.0: sdílené pravidlo žije jednou v TVAR-DOKUMENTU.md, blok nese jen větu pro svou roli s odkazem.
    const CEKANI = 'Čekání na čas (pravidlo v sekci Čekání na čas pravidel dokumentů běhu)'
    const ar = k.jeden('prd:řez 05')
    for (const t of [CEKANI, 'na organický čas čeká jen tam, kde to vize vede jako rozhodnutí majitele', 'čeká na rozhodnutí majitele', 'vrať ho v cekani',
      'vrátí nevztahuje-se s podmínkou a naměřenou hodnotou', 'docs/e2e/rez-05-pred.md', 'nepatří deployi', '**AK7 Rozpad útraty podle modelu.**',
      'skutečnost bývá 2× tvůj odhad', 'přesahuje ~8000 řádků', 'nejdelší cestou závislostí', `Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${ROZH[0]}`,
      "Pravidla dokumentů nečti celá: mapu sekcí dá rg -n '^## '"]) k.obsahuje(ar, t)
    k.neobsahuje(ar, 'nad ~12 k řádků', 'starou mez rozdělení řezu')
    const ks = k.jeden('prd-check:řez 05:1')
    for (const t of ['neměřitelné v okně E2E', 'podmíněný krok bez větve „nevztahuje se“', 'krok před nasazením nezávislý na kódu řezu', 'návrh neověřen: <proč>',
      'K1 → K2 → K3 (součet ~2050 ř., přerostlých nad ~800 ř.: 0)', 'posuň rozhraní do Kontraktu']) k.obsahuje(ks, t)
    const kc = k.jeden('prd-check:řez 05:část K2:1')
    for (const t of ['návrh neověřen: <proč>', 'neměřitelné v okně E2E']) k.obsahuje(kc, t)
    const fk = k.jeden('prd-fix:řez 05')
    for (const t of [CEKANI, 'nevztahuje-se', 'docs/e2e/rez-05-pred.md', 'Pole cekani vrať celé']) k.obsahuje(fk, t)
    const d = k.jeden('prd-check:řez 05:2')
    for (const t of ['návrh neověřen: <proč>', 'třetí kolo kontroly nebude']) k.obsahuje(d, t)
    k.ok(logy.some(l => l.includes('nejdelší cesta závislostí: K1 → K2 → K3')), 'log nejdelší cesty po architektovi')
    for (const x of volani) k.obsahuje(x, `Rozhodnutí majitele pro tento běh`, 'rozhodnutí majitele v rámci každého agenta')
    rozhrani(k, volani)
    return k.chyby
  },
}
