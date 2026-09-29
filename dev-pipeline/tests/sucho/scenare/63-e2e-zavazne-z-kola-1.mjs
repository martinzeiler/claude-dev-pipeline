// 63 · stavba · souvislost s nálezem 13: E2E kolo 1 selže a najde závažný nález mimo kritéria, kolo 2 (smoke nad FAIL) ho už
// nehlásí. Nález z kola 1 se nesmí ztratit (kolečko to má ošetřené): oprava fix-security po kole 2 běží.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'závažný nález z E2E kola 1 přežije kolo 2',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK1: uložení vrací 500'], zavazne_mimo_ak: ['SEC-63: token v URL'] })
    if (label === 'e2e:řez 05:2') return e2ePass(1)
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.obsahuje(k.jeden('fix-security:řez 05'), 'SEC-63', 'závažný nález z kola 1')
    return k.chyby
  },
}
