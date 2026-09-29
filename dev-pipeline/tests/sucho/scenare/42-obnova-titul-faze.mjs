// 42 · stavba · revize 1.4.0 nález 9: obnova s od_faze jako titulem fáze („Brána“, velké písmeno a diakritika). Blok ji normalizuje
// na brana: značku dostane brána, deploy a E2E, implementace a review ne.
import { argsStavby, kontrola } from '../stuby.mjs'

const Z = 'ZNACKA-42'

export default {
  nazev: 'obnova od „Brána“',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'Brána', znacka: Z, pokus: 1 } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['verify:řez 05:1', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05']) k.obsahuje(k.jeden(l), Z, 'značku obnovy')
    for (const l of ['implement:řez 05:1', 'thermo:řez 05', 'review:řez 05:1']) k.neobsahuje(k.jeden(l), Z, 'značku obnovy (fáze před bránou)')
    return k.chyby
  },
}
