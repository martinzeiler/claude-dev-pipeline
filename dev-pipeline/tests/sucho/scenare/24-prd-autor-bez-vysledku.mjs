// 24 · PRD · autor části K2 nevrátí výsledek ani po opakování (§ 2 Tok 2): blok vrátí ok: false s důvodem, kontrola se nekoná.
// Opakování po chybě nese větu C2 (§ 1.2).
import { argsPrd, kontrola, stub, NIC, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'autor části nevrátí výsledek',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-část:řez 05:K2') return NIC
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/K2/.test(S(v && v.duvod)) && /nevrátil/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.nic(/^prd-check:/, 'kontrola po selhaném autorovi')
    const pokusy = k.s(/^prd-část:řez 05:K2$/)
    k.ok(pokusy.length >= 2, `autor K2 bez opakování (${pokusy.length} volání)`)
    if (pokusy.length >= 2) {
      k.neobsahuje(pokusy[0], 'Předchozí běh tohoto zadání skončil bez výsledku', 'větu C2 v prvním běhu')
      k.obsahuje(pokusy[1], 'Předchozí běh tohoto zadání skončil bez výsledku', 'větu C2 při opakování')
    }
    return k.chyby
  },
}
