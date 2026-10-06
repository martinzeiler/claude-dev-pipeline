// 88 · stavba · 1.6.0 (spec § 1.2): relativní cesta předávky platí a doplní se na absolutní (běh web-rijen: části řezu 10 vrátily
// cestu bez úvodního lomítka a blok jejich nedokončenou práci bral jako hotovou).
import { argsStavby, kontrola, stub, CWD } from '../stuby.mjs'

export default {
  nazev: 'relativní cesta předávky',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'implement:řez 05:1') return stub(label, { stav: 'castecne', predavka: 'docs/reviews/predavka-a88.md' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, predavky: 1 })
    k.obsahuje(k.jeden('implement:řez 05:1:n2'), `Nejdřív přečti předávku ${CWD}/docs/reviews/predavka-a88.md`, 'absolutní cestu předávky')
    const i1 = k.jeden('implement:řez 05:1')
    k.ok(i1 && /absolutní cesta/.test(i1.schema.properties.predavka.description), 'popis pole predavka chce absolutní cestu')
    return k.chyby
  },
}
