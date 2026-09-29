// 14 · stavba · obnova {od_faze: 'deploy', znacka} (§ 1.10): značka změní prompty deploye, E2E a uzavření (přehrají se znovu),
// prompty implementace, review a brány zůstanou beze změny (vrátí se z cache).
import { argsStavby, kontrola } from '../stuby.mjs'

const Z = 'ZNACKA-OBNOVA-0300'

export default {
  nazev: 'obnova od deploye',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: Z } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05']) k.obsahuje(k.jeden(l), Z, `značku obnovy ${Z}`)
    for (const l of ['implement:řez 05:1', 'thermo:řez 05', 'review:řez 05:1', 'verify:řez 05:1']) k.neobsahuje(k.jeden(l), Z, 'značku obnovy (fáze před deployem)')
    return k.chyby
  },
}
