// 179 · stavba · 1.9.0 (§ 7.2): pokyny majitele k prostředí (app_pristup) jdou deployi, dokladu a E2E celé, bez tichého useknutí
// (dřív slice 1 200 znaků; délku hlídá args-bloku.py).
import { argsStavby, kontrola } from '../stuby.mjs'

const PRISTUP = `${'pokyn k prostředí '.repeat(75)}KONEC-179`

export default {
  nazev: 'app_pristup celé v deployi, dokladu a E2E',
  blok: 'blok-stavby',
  args: argsStavby({ app_pristup: PRISTUP, doklad_pred: true }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(PRISTUP.length > 1300, 'pokyny delší než dřívější useknutí')
    for (const l of ['deploy:řez 05:1', 'doklad:řez 05', 'e2e:řez 05:1']) k.obsahuje(k.jeden(l), 'KONEC-179', 'konec pokynů k prostředí (celé znění)')
    return k.chyby
  },
}
