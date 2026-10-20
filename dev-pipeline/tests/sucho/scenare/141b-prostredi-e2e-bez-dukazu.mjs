// 141b · stavba · 1.8.0 (spec § 2.2): kritérium prostředí bez důkazu je FAIL: oprava a kolo 2 jako u běžného selhání.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'E2E prostredi bez důkazu je FAIL',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { pass: 7, prostredi: [{ kriterium: 'AK5 Rychlost detailu', dukaz: '' }] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('fix-e2e:řez 05:1'); k.jeden('e2e:řez 05:2')
    k.obsahuje(k.jeden('fix-e2e:řez 05:1'), 'AK5 Rychlost detailu (prostředí bez důkazu)', 'FAIL z prostředí bez důkazu')
    k.ok(logy.some(l => /kritérií prostředí bez důkazu, počítají se jako FAIL/.test(l)), 'log o prostředí bez důkazu')
    return k.chyby
  },
}
