// 43 · stavba · revize 1.4.0 nález 9: obnova s neznámou fází. Blok nesmí běžet bez značky (vše z cache včetně červené brány):
// značka platí od refresh, tedy pro všechny fáze, a log to řekne.
import { argsStavby, kontrola } from '../stuby.mjs'

const Z = 'ZNACKA-43'

export default {
  nazev: 'obnova od neznámé fáze',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'nasazování', znacka: Z, pokus: 1 } }),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['implement:řez 05:1', 'review:řez 05:1', 'verify:řez 05:1', 'deploy:řez 05:1']) k.obsahuje(k.jeden(l), Z, 'značku obnovy')
    k.ok(logy.some(l => /neznámá fáze .*značka platí od refresh/.test(l)), 'log o neznámé fázi a značce od refresh')
    return k.chyby
  },
}
