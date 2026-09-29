// 49 · stavba · revize 1.4.0 nález 13: E2E kolo 1 vrátí fail 2 bez fail_kriteria. Kolo 2 nemůže přeměřit „jen FAIL kritéria“
// (prázdný seznam by prošel naprázdno): přeměří všechna a výsledek je výsledek kola 2.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'E2E fail bez jmen: kolo 2 přeměří všechna',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [] })
    if (label === 'e2e:řez 05:2') return e2ePass(8)
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const e2 = k.jeden('e2e:řez 05:2')
    k.neobsahuje(e2, 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2 na prázdný seznam FAIL')
    k.obsahuje(k.jeden('fix-e2e:řez 05:1'), '2 bez jmen', 'počet FAIL bez jmen pro opravu')
    k.rovno(v && v.e2e && v.e2e.celkem, 8, 'návrat.e2e.celkem z kola 2')
    k.ok(logy.some(l => /kolo 2 přeměří všechna/.test(l)), 'log o plném přeměření')
    return k.chyby
  },
}
