// 203f · kolečko · 1.10.0 (ověření review N16): při osmi oblastech jdou nepokryté adresáře do poslední oblasti, devátý reviewer
// nevznikne. Rozdělení bez vsechny_adresare jen zaloguje, že pokrytí nejde ověřit (scénář 203d).
import { argsKolecko, kontrola } from '../stuby.mjs'

const OBLASTI = Array.from({ length: 8 }, (_, i) => ({ nazev: `o${i + 1}`, cesty: [`apps/o${i + 1}`] }))

export default {
  nazev: 'kolečko: nepokryté adresáře při osmi oblastech do poslední',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'oblasti:kolečko') return { oblasti: OBLASTI, vsechny_adresare: [...OBLASTI.map(o => o.cesty[0]), 'apps/navic/src'] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^review:kolečko:1:\d+$/, 8, 'osm reviewerů, žádný devátý')
    k.obsahuje(k.jeden('review:kolečko:1:8'), 'apps/o8, apps/navic/src', 'nepokrytý adresář v poslední oblasti')
    k.ok(logy.some(l => l.includes('1 adresářů změn větve mimo oblasti přidáno do poslední oblasti „o8“: apps/navic/src')), 'log nepokrytých')
    return k.chyby
  },
}
