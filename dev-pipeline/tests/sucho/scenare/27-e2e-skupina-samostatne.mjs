// 27 · stavba · revize 1.4.0 nález 1: verifikátor b nevrátí výsledek v souběhu (3 běhy run()), samostatně už ano. Řez se uzavře
// s počty všech tří skupin (30 kritérií), ne jen a a c.
import { argsStavby, kontrola, NIC, e2ePass } from '../stuby.mjs'

const SEKCE = [{ nazev: 'Sekce A', kriterii: 10 }, { nazev: 'Sekce B', kriterii: 10 }, { nazev: 'Sekce C', kriterii: 10 }]

export default {
  nazev: 'E2E skupina doběhne samostatně',
  blok: 'blok-stavby',
  args: argsStavby({ kriteria: 30, e2e_sekce: SEKCE }),
  odpoved(label, prompt, opts, stav) {
    if (label === 'e2e:řez 05:1:b') return stav.pocty[label] <= 3 ? NIC : e2ePass(10)
    if (/^e2e:řez 05:1:[ac]$/.test(label)) return e2ePass(10)
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.rovno(v && v.e2e && v.e2e.celkem, 30, 'návrat.e2e.celkem (všechny tři skupiny)')
    const b = k.pocet(/^e2e:řez 05:1:b$/, 4, 'verifikátor b')
    if (b[3]) k.obsahuje(b[3], 'ostatní sekce už ověřili ostatní verifikátoři')
    k.ok(logy.some(l => /verifikátor b nevrátil výsledek, pouštím ho ještě jednou samostatně/.test(l)), 'log o samostatném běhu verifikátoru b')
    return k.chyby
  },
}
