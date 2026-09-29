// 30 · stavba · revize 1.4.0 nález 3: verify vyplní predavka textem „žádná“ a nástupce implementace zopakuje cestu předávky
// předchůdce. Ani jedno není nová předávka: návrat je konečný, blok pokračuje a řez je hotový s jedinou předávkou.
import { argsStavby, kontrola, stub, zelenaBrana, CWD } from '../stuby.mjs'

const P = `${CWD}/docs/reviews/predavka-a1b2c3.md`

export default {
  nazev: 'předávka „žádná“ a ozvěna předchůdce',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label, prompt) {
    if (label.startsWith('verify:')) { const m = /ulož do (\S+?\.md)/.exec(prompt); return zelenaBrana({ predavka: 'žádná', ...(m ? { vystup_path: m[1] } : {}) }) }
    if (label.startsWith('implement:řez 05:1')) return stub(label, { predavka: P })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, predavky: 1 })
    k.pocet(/^implement:řez 05:1:n2$/, 1, 'nástupce implementace')
    k.nic(/:n3$/, 'nástupce po ozvěně předávky předchůdce')
    k.nic(/^verify:.*:n\d$/, 'nástupce brány po predavka „žádná“')
    k.ok(logy.some(l => /není nová předávka/.test(l)), 'log o neuznané předávce')
    return k.chyby
  },
}
