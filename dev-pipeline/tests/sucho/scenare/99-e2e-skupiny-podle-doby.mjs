// 99 · stavba · 1.6.0 (spec § 1.9): skupiny verifikátorů podle doby z PRD (běh web-rijen: řez 4 34,5 proti 11,6 min, řez 10 41 min
// jedním verifikátorem). Sekce bez souběhu jdou jednou skupinou, která běží sama až po doběhu ostatních (review 1.6.0 N4: měření
// výkonu pod zátěží dalších verifikátorů); ostatní od nejdelší do skupin s cílem ~20 min a nejvýš 12 kritérii.
import { argsStavby, kontrola, parsujLabel, e2ePass } from '../stuby.mjs'

const SEKCE = [
  { nazev: 'Sekce A', kriterii: 6, doba_min: 30 }, { nazev: 'Sekce B', kriterii: 4, doba_min: 8 }, { nazev: 'Sekce C', kriterii: 4, doba_min: 8 },
  { nazev: 'Sekce D', kriterii: 3, doba_min: 5, bez_soubehu: true }, { nazev: 'Sekce E', kriterii: 2, doba_min: 6, bez_soubehu: true }, { nazev: 'Sekce F', kriterii: 2, doba_min: 3 },
]
const SKUPINY = { a: ['Sekce A'], b: ['Sekce B', 'Sekce C', 'Sekce F'], c: ['Sekce D', 'Sekce E'] }

export default {
  nazev: 'E2E skupiny podle doby a souběhu',
  blok: 'blok-stavby',
  args: argsStavby({ kriteria: 21, e2e_sekce: SEKCE }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'e2e' && l.pismeno) return e2ePass(7)
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^e2e:řez 05:1(:|$)/, 3, 'verifikátoři kola 1')
    for (const [p, sekce] of Object.entries(SKUPINY)) {
      const e = k.jeden(`e2e:řez 05:1:${p}`)
      for (const s of SEKCE.map(x => x.nazev)) (sekce.includes(s) ? k.obsahuje : k.neobsahuje)(e, s)
    }
    const [a, b, c] = ['a', 'b', 'c'].map(p => k.jeden(`e2e:řez 05:1:${p}`))
    k.soubezne(a, b); k.pred(a, c); k.pred(b, c)
    k.obsahuje(c, 'nad aplikací teď běžíš sám', 'skupina bez souběhu ví, že běží sama')
    return k.chyby
  },
}
