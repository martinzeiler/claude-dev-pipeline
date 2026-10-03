// 68 · stavba · 1.5.0 (spec § 1.12): doklad před migrací se v bloku pořizuje jednou. Pokus 2 ho znovu nepořizuje a deploy dostane
// cestu z návratu agenta, ne pevnou (běh web-podzim: řez 04 v pokusu 2 přepsal doklad stavem po zápisech). Zadání dokladu nese pokus
// a zákaz přepsat existující soubor.
import { argsStavby, kontrola, stub, pokusZ, CWD } from '../stuby.mjs'

const CESTA = `${CWD}/docs/e2e/rez-05-doklad-pred-68.md`

export default {
  nazev: 'doklad jednou za blok, cesta z návratu',
  blok: 'blok-stavby',
  args: argsStavby({ doklad_pred: true }),
  odpoved(label, p, o, stav) {
    if (label === 'doklad:řez 05') return stub(label, { path: CESTA })
    if (label === 'deploy:řez 05:1' && pokusZ(stav) === 1) return stub(label, { stav: 'failed', infra: false, duvod: 'BUILD-68 selhal build' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2, doklad_pred: CESTA })
    k.pocet(/^doklad:/, 1, 'doklad jednou za blok')
    const dk = k.jeden('doklad:řez 05')
    k.obsahuje(dk, 'Pokus 1.', 'číslo pokusu')
    k.obsahuje(dk, 'nepřepisuj', 'zákaz přepsat existující doklad')
    for (const d of k.s(/^deploy:/)) k.obsahuje(d, CESTA, 'cestu dokladu z návratu agenta')
    return k.chyby
  },
}
