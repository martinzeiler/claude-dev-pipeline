// 03 · stavba · brána s nulou prošlých testů (exit 0, selhalo 0, proslo 0): suita neproběhla, zelena() v § 1.9 ji má za červenou.
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'brána proslo 0 je červená',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ proslo: 0 })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    const v1 = k.jeden('verify:řez 05:1'), fb = k.jeden('fix-brana:řez 05'), v2 = k.jeden('verify:řez 05:2'), de = k.jeden('deploy:řez 05:1')
    k.pred(v1, fb); k.pred(fb, v2); k.pred(v2, de)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    return k.chyby
  },
}
