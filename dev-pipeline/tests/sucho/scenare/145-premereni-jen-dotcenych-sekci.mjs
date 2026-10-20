// 145 · stavba · 1.8.0 (spec § 2.12): sekce E2E nesou oblasti. V pokusu 2 po opravě se přeměřují jen skupiny, jejichž sekce mají oblasti
// protínající opravu; skupina mimo opravu se přenese z posledního zeleného kola a návrat ji jmenuje v prenesene_sekce.
import { argsStavby, kontrola, e2ePass, stub } from '../stuby.mjs'

const SEKCE = [{ nazev: 'Admin', kriterii: 4, doba_min: 15, oblasti: ['admin'] }, { nazev: 'Web', kriterii: 4, doba_min: 15, oblasti: ['web'] }]
const FAIL = e2ePass(4, { vysledek: 'fail', pass: 3, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam v adminu', selhani: 'prázdný' }] })

export default {
  nazev: 'pokus 2 přeměří jen sekce dotčené opravou',
  blok: 'blok-stavby',
  args: argsStavby({ e2e_sekce: SEKCE, max_pokusu: 2 }),
  odpoved(label, p, o, stav) {
    if (label === 'e2e:řez 05:1:a') return stav.pocty[label] === 1 ? FAIL : null
    if (label === 'e2e:řez 05:2') return FAIL
    if (label === 'implement:řez 05:2') return stub(label, { oblasti: ['admin'], soubory: ['apps/admin/seznam.ts'], zmenena_mista: ['apps/admin/seznam.ts: nacti'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2, prenesene_sekce: ['Web'] })
    k.pocet(/^e2e:řez 05:1:a$/, 2, 'skupina Admin se v pokusu 2 přeměří')
    k.pocet(/^e2e:řez 05:1:b$/, 1, 'skupina Web se v pokusu 2 přenese')
    k.ok(logy.some(l => /skupina sekcí se přenáší z posledního zeleného kola/.test(l)), 'log o přenosu')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'přenesené z dřívějšího kola bez přeměření', 'přenesené sekce v uzavření')
    return k.chyby
  },
}
