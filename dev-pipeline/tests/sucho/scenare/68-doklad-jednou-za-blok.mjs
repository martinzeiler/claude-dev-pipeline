// 68 · stavba · 1.5.0 (spec § 1.12): doklad před migrací se v bloku pořizuje jednou. Pokus 2 ho znovu nepořizuje a deploy dostane
// cestu z návratu agenta, ne pevnou (běh web-podzim: řez 04 v pokusu 2 přepsal doklad stavem po zápisech). Zadání dokladu nese pokus
// a zákaz přepsat existující soubor. Od 1.12.0 (spec J1) jde před dokladem commit řezu bez nasazení (běh 0 deploye): jen v pokusu, který doklad
// pořizuje, a cestu dokladu dostávají až běhy nasazení.
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
    k.rovno(k.s(/^deploy:/).map(d => d.label), ['deploy:řez 05:0', 'deploy:řez 05:1', 'deploy:řez 05:p2:1'], 'commit před dokladem jen v pokusu 1, pak nasazení obou pokusů')
    k.pred(k.jeden('deploy:řez 05:0'), dk)
    for (const d of k.s(/^deploy:řez 05:(p2:)?1$/)) k.obsahuje(d, CESTA, 'cestu dokladu z návratu agenta')
    k.neobsahuje(k.jeden('deploy:řez 05:p2:1'), 'Commit řezu už existuje', 'větu o commitu před dokladem v pokusu bez nového dokladu')
    // Doklad z pokusu 1 nese commit pokusu 1; nasazení pokusu 2 se dozví, že platí dál i po dalším commitu řezu.
    const c0 = k.jeden('deploy:řez 05:0').odpoved.commit
    k.obsahuje(k.jeden('deploy:řez 05:p2:1'), `Doklad vznikl dřív nad commitem řezu ${c0} a zachycuje stav před prvním zápisem: platí dál`, 'platnost dokladu z dřívějšího pokusu')
    k.neobsahuje(k.jeden('deploy:řez 05:1'), 'Doklad vznikl dřív', 'větu o dřívějším dokladu v běhu hned po dokladu')
    return k.chyby
  },
}
