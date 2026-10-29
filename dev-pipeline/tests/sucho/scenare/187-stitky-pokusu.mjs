// 187 · stavba · 1.10.0 (spec H4): štítky deploye, brány a E2E nesou od pokusu 2 číslo pokusu (:p2), v pokusu 1 zůstávají beze změny;
// implementace a review je nesou jako dřív. Dva deploye řezu 18 se v běhu zaklad-dat jmenovaly stejně „deploy:řez 18:1“.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })

export default {
  nazev: 'štítky pokusu 2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: label => label === 'e2e:řez 05:1' || label === 'e2e:řez 05:2' ? FAIL : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    for (const l of ['verify:řez 05:1', 'deploy:řez 05:1', 'deploy:řez 05:2', 'e2e:řez 05:1', 'e2e:řez 05:2', 'verify:řez 05:p2:1', 'deploy:řez 05:p2:1', 'e2e:řez 05:p2:1', 'implement:řez 05:2']) k.jeden(l)
    k.pocet(/^verify:řez 05:1$/, 1, 'brána pokusu 1 jednou')
    k.obsahuje(k.jeden('verify:řez 05:p2:1'), 'rez-05-p2-verify', 'report pokusu 2')
    return k.chyby
  },
}
