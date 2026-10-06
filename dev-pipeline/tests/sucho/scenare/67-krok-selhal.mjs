// 67 · stavba · 1.5.0 (spec § 1.4): krok po nasazení se stavem selhalo (proběhl, ověření z PRD neprošlo) je selhání nasazení
// (běh web-podzim: řez 11 vrátil neúspěšné ověření promazání keše jako „provedeno“). Od 1.6.0 malý řez v pokusu 2 jen dorovná
// deploy, který dostane krok i důvod.
import { argsStavby, kontrola, stub, pokusZ } from '../stuby.mjs'

export default {
  nazev: 'krok se stavem selhalo je selhání nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'deploy:řez 05:1' && pokusZ(stav) === 1 && stav.pocty[label] === 1) return stub(label, { kroky_po_nasazeni: [{ id: 3, krok: 'OVERENI-67 purge Cache API', stav: 'selhalo', duvod: 'HIT se starým razítkem' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^implement:řez 05:2$/, 'dorovnání deploye nepouští implementaci')
    const d2 = volani.filter(x => /^deploy:/.test(x.label))[1]
    k.ok(!!d2, 'pokus 2 bez deploye')
    k.obsahuje(d2, 'OVERENI-67', 'selhaný krok z pokusu 1')
    k.obsahuje(d2, 'HIT se starým razítkem', 'důvod selhání kroku')
    return k.chyby
  },
}
