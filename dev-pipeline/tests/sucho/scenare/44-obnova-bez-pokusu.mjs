// 44 · stavba · revize 1.4.0 nález 10: obnova bez pokusu. Blok neví, ve kterém pokusu běh spadl, a značku dá od pokusu 1;
// musí to hlasitě zalogovat, ať orchestrátor příště pokus pošle.
import { argsStavby, kontrola } from '../stuby.mjs'

export default {
  nazev: 'obnova bez pokusu: log',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'e2e', znacka: 'Z44' } }),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(logy.some(l => /obnova bez pokusu: značka platí od pokusu 1/.test(l)), 'log „obnova bez pokusu: značka platí od pokusu 1“')
    k.obsahuje(k.jeden('e2e:řez 05:1'), 'Z44', 'značku obnovy od pokusu 1')
    return k.chyby
  },
}
