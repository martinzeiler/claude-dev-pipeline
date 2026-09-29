// 25 · PRD · kostra needs-fixes a autor vrátí kontrakt_doplnit (§ 2 Tok 4–5): nejdřív zapracování kostry (s kontrakt_doplnit),
// a protože změnilo Kontrakt, pak souběžně všechny části se změněnými místy kostry; delta jen nad kostrou, která měla blokující nález.
import { argsPrd, kontrola, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const IDS = CASTI3.map(c => c.id)

export default {
  nazev: 'zapracování kostry mění Kontrakt, části se sjednotí',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-část:řez 05:K2') return stub(label, { kontrakt_doplnit: ['DOPLNIT-KONTRAKT: typ Rozpocet sdílený s K3'] })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 1, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['## Kontrakt: typ Rozpocet ZMENA-KONTRAKTU'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const ks = k.jeden('prd-check:řez 05:1'), kc = IDS.map(id => k.jeden(`prd-check:řez 05:část ${id}:1`))
    const fk = k.jeden('prd-fix:řez 05'), fc = IDS.map(id => k.jeden(`prd-fix:řez 05:část ${id}`))
    for (const c of [ks, ...kc]) k.pred(c, fk)
    k.obsahuje(ks, 'DOPLNIT-KONTRAKT', 'kontrakt_doplnit autorů jako hypotézy pro úplnost kontraktu')
    k.obsahuje(fk, 'DOPLNIT-KONTRAKT', 'kontrakt_doplnit autora části')
    k.vsechnySoubezne(fc, 'zapracování částí')
    fc.forEach(f => { k.pred(fk, f); k.obsahuje(f, 'ZMENA-KONTRAKTU', 'změněná místa kostry') })
    const d = k.jeden('prd-check:řez 05:2')
    k.pred(fk, d)
    k.nic(/^prd-check:řez 05:část [^:]+:2$/, 'delta kontrola části bez blokujících nálezů')
    return k.chyby
  },
}
