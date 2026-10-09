// 127 · stavba · 1.7.0 (spec § 2 A1): oprava po E2E, která změnila jen gitignorovaný report v docs/reviews/, strom nemění. Blok ji
// bere jako „nic“: žádná brána, commit ani nasazení navíc, kolo 2 E2E bez nového nasazení (běh sonnet-5-5: zbytečný deploy agent).
import { argsStavby, kontrola, oprava, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'oprava jen v docs/reviews nic nenasazuje',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK3 Export: prázdný řádek'] })
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['docs/reviews/rez-05-p1-e2e-kolo-1.md: doplněn doklad'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^(deploy:řez 05:2|verify:řez 05:e2e)/, 'oprava jen v docs/reviews')
    k.jeden('e2e:řez 05:2')
    return k.chyby
  },
}
