// 219 · kolečko · 1.11.0 (spec D3): čitelnost nespouští opravný cyklus; jde do follow-ups [oprava] a jmenovitě do návratu.
import { argsKolecko, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'kolečko: čitelnost bez opravného cyklu',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(5, { citelnost: [{ plocha: 'Přehled', co: 'zkratka bez vysvětlení', proc: '' }] }) : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^(fix-e2e|fix-citelnost|e2e:kolečko:2)/, 'opravný cyklus kvůli čitelnosti')
    k.obsahuje(k.jeden('závěr:kolečko'), '[kolečko · E2E] [oprava] čitelnost: Přehled: zkratka bez vysvětlení', 'follow-up')
    k.rovno(v && v.e2e && v.e2e.vysledek, 'pass', 'verdikt beze změny')
    k.rovno(v && v.e2e && v.e2e.citelnost, ['Přehled: zkratka bez vysvětlení'], 'jmenovitě v návratu')
    return k.chyby
  },
}
