// 98b · stavba · 1.6.0 (review 1.6.0 N10): oprava po E2E, která změnila jen docs/, nejde bránou ani nasazením, jen commitem.
import { argsStavby, kontrola, e2ePass, oprava } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK3: scénář zastaral'] })

export default {
  nazev: 'oprava po E2E jen v docs: commit bez brány',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['docs/e2e/rez-05.md: AK3'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^verify:řez 05:e2e/, 'oprava jen v docs bez brány')
    k.obsahuje(k.jeden('deploy:řez 05:2'), 'jen commitni, nic nenasazuj', 'commit bez nasazení')
    return k.chyby
  },
}
