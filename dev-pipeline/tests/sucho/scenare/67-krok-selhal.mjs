// 67 · stavba · 1.5.0 (spec § 1.4): krok po nasazení se stavem selhalo (proběhl, ověření z PRD neprošlo) je selhání nasazení:
// pokus 2 dostane krok i důvod (běh web-podzim: řez 11 vrátil neúspěšné ověření promazání keše jako „provedeno“).
import { argsStavby, kontrola, stub, pokusZ } from '../stuby.mjs'

export default {
  nazev: 'krok se stavem selhalo je selhání nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'deploy:řez 05:1' && pokusZ(stav) === 1) return stub(label, { kroky_po_nasazeni: [{ krok: 'OVERENI-67 purge Cache API', stav: 'selhalo', duvod: 'HIT se starým razítkem' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const i2 = k.jeden('implement:řez 05:2')
    k.obsahuje(i2, 'OVERENI-67', 'selhaný krok z pokusu 1')
    k.obsahuje(i2, 'HIT se starým razítkem', 'důvod selhání kroku')
    return k.chyby
  },
}
