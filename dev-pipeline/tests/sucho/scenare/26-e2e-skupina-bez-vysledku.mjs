// 26 · stavba · revize 1.4.0 nález 1: verifikátor skupiny b nevrátí výsledek ani po opakování. Skupina bez výsledku není pass:
// blok ji pustí ještě jednou samostatně (po doběhu a, c) a když ani tak nic nevrátí, E2E selže; řez se neuzavře s neověřenou sekcí.
import { argsStavby, kontrola, NIC, e2ePass, S } from '../stuby.mjs'

const SEKCE = [{ nazev: 'Sekce A', kriterii: 10 }, { nazev: 'Sekce B', kriterii: 10 }, { nazev: 'Sekce C', kriterii: 10 }]

export default {
  nazev: 'E2E skupina bez výsledku je selhání',
  blok: 'blok-stavby',
  args: argsStavby({ kriteria: 30, e2e_sekce: SEKCE, max_pokusu: 1 }),
  odpoved(label) {
    if (label === 'e2e:řez 05:1:b') return NIC
    if (/^e2e:řez 05:1:[ac]$/.test(label)) return e2ePass(10)
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'e2e' })
    k.ok(/verifikátor b nevrátil výsledek/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    const b = k.pocet(/^e2e:řez 05:1:b$/, 6, 'verifikátor b: 3 běhy souběžně s a, c a 3 samostatně')
    const a = k.jeden('e2e:řez 05:1:a'), c = k.jeden('e2e:řez 05:1:c')
    if (b.length === 6) { k.pred(a, b[3]); k.pred(c, b[3]); k.obsahuje(b[3], 'ostatní sekce už ověřili ostatní verifikátoři', 'samostatný běh bez souběžných verifikátorů') }
    k.nic(/^uzavření:/, 'uzavření s neověřenou sekcí B')
    return k.chyby
  },
}
