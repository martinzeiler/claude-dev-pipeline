// 178b · stavba · 1.9.0 (§ 1.1, review N8): obnova od E2E bez bez_cache obnova-stav nevolá (jeho výstup čte jen deploy, který se
// nepřeměřuje); fáze před E2E jdou z cache beze změny promptů, E2E a uzavření nesou značku.
import { argsStavby, kontrola } from '../stuby.mjs'

const Z = 'ZNACKA-178b'

export default {
  nazev: 'obnova od E2E: bez obnova-stav',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'e2e', znacka: Z, pokus: 1 } }),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^obnova-stav:/, 'obnova-stav při obnově od E2E')
    for (const l of ['e2e:řez 05:1', 'uzavření:řez 05']) k.obsahuje(k.jeden(l), Z, 'značku obnovy')
    for (const l of ['implement:řez 05:1', 'review:řez 05:1', 'verify:řez 05:1', 'deploy:řez 05:1']) k.neobsahuje(k.jeden(l), Z, 'značku obnovy před E2E')
    k.ok(logy.some(l => /obnova-stav se nevolá \(nasazení se nepřeměřuje\)/.test(l)), 'log')
    return k.chyby
  },
}
