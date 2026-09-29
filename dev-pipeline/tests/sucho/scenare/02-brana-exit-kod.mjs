// 02 · stavba · brána hlásí selhalo 0, ale exit kód testů 1 (v běhu bez-dluhu brána pustila zelenou nad neproběhlou suitou):
// podle zelena() v § 1.9 je červená, běží jedna oprava brány a druhý běh.
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'brána selhalo 0 a exit_kod 1 je červená',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ exit_kod: 1, selhavajici: ['vitest: proces skončil před souhrnem (exit 1)'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    const v1 = k.jeden('verify:řez 05:1'), fb = k.jeden('fix-brana:řez 05'), v2 = k.jeden('verify:řez 05:2'), de = k.jeden('deploy:řez 05:1')
    k.pred(v1, fb); k.pred(fb, v2); k.pred(v2, de)
    k.pocet(/^fix-brana:/, 1, 'jedna oprava brány')
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    return k.chyby
  },
}
