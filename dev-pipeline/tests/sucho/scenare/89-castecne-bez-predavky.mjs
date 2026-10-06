// 89 · stavba · 1.6.0 (spec § 1.2, § 1.6): část se stavem castecne bez předávky není hotová. Dostane nástupce; druhé castecne bez
// předávky je selhání části (běh web-rijen: K3 řezu 10 hotová ze dvou třetin a K4 „není hotová“, na nich stavěly K8 a K9).
// Seznamy předchůdce bez předávky nese blok k nástupci a follow-upy neúspěšného pokusu dojdou do uzavření.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'castecne bez předávky: nástupce, pak selhání části',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), max_pokusu: 2 }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { stav: 'castecne', follow_ups: ['FU-89-K1 z předchůdce'] })
    if (label === 'implement:řez 05:část K1:1:n2') return stub(label, { stav: 'castecne', predavka: '' })
    if (label === 'implement:řez 05:část K2:1') return stub(label, { stav: 'castecne', follow_ups: ['FU-89-K2 z předchůdce'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.obsahuje(k.jeden('implement:řez 05:část K2:1:n2'), 'Předchůdce práci nedokončil a předávku nezapsal', 'pokyn nástupci bez předávky')
    k.nic(/^implement:řez 05:část K2:2/, 'K2 dokončil nástupce, v pokusu 2 se neopakuje')
    // Review části K1 (kolo 1) až po jejím dokončení v pokusu 2: nedokončená část do review nejde.
    k.pred(k.jeden('implement:řez 05:část K1:2'), k.jeden('review:řez 05:část K1:1'))
    k.ok(logy.some(l => /znovu castecne bez předávky/.test(l)), 'log selhání části po druhém castecne')
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, 'FU-89-K2', 'follow-up předchůdce bez předávky')
    k.obsahuje(c, 'FU-89-K1', 'follow-up neúspěšného pokusu')
    return k.chyby
  },
}
