// 140b · stavba · 1.8.0 (spec § 2.2): stav prostredi bez důkazu bere blok jako selhalo: část jde do dalšího pokusu jako po selhání.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'část prostredi bez důkazu je selhalo',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]) }),
  odpoved(label, p, o, stav) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { stav: 'prostredi', dukaz: '' })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.jeden('implement:řez 05:část K1:2')
    k.ok(logy.some(l => /část K1: stav prostredi bez důkazu, blok ho bere jako selhalo/.test(l)), 'log o prostředí bez důkazu')
    k.ok(!(v && v.rozhodnuti || []).some(x => x && x.typ === 'prostredi'), 'bez důkazu žádná otázka prostředí')
    return k.chyby
  },
}
