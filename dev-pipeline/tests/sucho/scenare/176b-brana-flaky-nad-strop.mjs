// 176b · stavba · 1.9.0 (§ 4.3): víc než 3 testy ve flaky je červená brána: jedna oprava a druhý běh.
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'brána s flaky nad strop 3 je červená',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ flaky: ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('fix-brana:řez 05'); k.jeden('verify:řez 05:2')
    const fb = k.jeden('fix-brana:řez 05')
    k.obsahuje(fb, '4 testů prošlo až samostatně po timeoutu (strop 3)', 'důvod červené brány')
    k.obsahuje(fb, 'testy nad limitem pod zátěží (4, strop 3): a.test.ts | b.test.ts | c.test.ts | d.test.ts; u nich zlevni měření', 'jména flaky testů a pokyn zlevnit měření')
    k.obsahuje(fb, 'limit nezvedej', 'zákaz zvednutí limitu')
    k.ok(logy.some(l => /brána červená: 4 testů prošlo až samostatně po timeoutu \(strop 3\)/.test(l)), 'log červené brány')
    k.neobsahuje(k.jeden('uzavření:řez 05'), 'přesáhl limit pod zátěží', 'follow-upy flaky z červené brány')
    return k.chyby
  },
}
