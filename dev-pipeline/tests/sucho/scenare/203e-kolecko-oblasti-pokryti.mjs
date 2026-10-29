// 203e · kolečko · 1.10.0 (ověření review N16): agent rozdělení vrátí i vsechny_adresare změn větve. Adresáře, které žádná oblast
// nepokrývá (cesta oblasti není tentýž adresář ani jeho předek), přidá blok do nové oblasti „nezařazené“, když je oblastí méně než 8,
// a zaloguje to; adresář pod cestou oblasti je pokrytý a docs/ se nepočítá.
import { argsKolecko, kontrola } from '../stuby.mjs'

const OBLASTI = [{ nazev: 'api', cesty: ['apps/api/src'] }, { nazev: 'admin', cesty: ['apps/admin/src/'] }, { nazev: 'balíčky', cesty: ['packages/shared'] }]
const ADRESARE = ['apps/api/src', 'apps/api/src/routes', 'apps/admin/src/lib', 'packages/shared/src', 'apps/web/src', 'scripts', 'docs/prd']

export default {
  nazev: 'kolečko: nepokryté adresáře změn jdou do nové oblasti',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'oblasti:kolečko') return { oblasti: OBLASTI, vsechny_adresare: ADRESARE }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pole(k.jeden('oblasti:kolečko'), ['vsechny_adresare'], 'rozdělení')
    k.pocet(/^review:kolečko:1:\d+$/, 4, 'tři oblasti a nová „nezařazené“')
    const r4 = k.jeden('review:kolečko:1:4')
    k.obsahuje(r4, 'oblast 4 z 4 „nezařazené“: jen změny větve v cestách apps/web/src, scripts', 'nepokryté adresáře v nové oblasti')
    k.neobsahuje(r4, 'apps/api/src/routes', 'pokrytý podadresář'); k.neobsahuje(r4, 'docs/prd', 'docs mezi adresáři review')
    k.ok(logy.some(l => l.includes('2 adresářů změn větve mimo oblasti přidáno do nové oblasti „nezařazené“: apps/web/src, scripts')), 'log nepokrytých')
    return k.chyby
  },
}
