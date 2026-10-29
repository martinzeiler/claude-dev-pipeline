// 148b · kolečko · 1.8.0 (spec § 2.6): bez položek [oprava] se vlna dluhu nekoná: žádný fix, brána ani commit dluhu.
import { argsKolecko, kontrola } from '../stuby.mjs'

export default {
  nazev: 'kolečko: dluh bez položek',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 0, opraveno: 0, odmitnuto: 0, uz_vyreseno: 0, varek: 0 } })
    k.jeden('dluh:kolečko')
    k.nic(/^(fix|verify|commit):kolečko:dluh/, 'bez položek žádná vlna')
    k.ok(logy.some(l => /dluh: žádná položka \[oprava\]/.test(l)), 'log o prázdném dluhu')
    return k.chyby
  },
}
