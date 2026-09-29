// 50 · kolečko · revize 1.4.0 nález 13: E2E kolečka kolo 1 vrátí fail 2 bez fail_kriteria; kolo 2 přeměří všechna kritéria,
// ne prázdný seznam.
import { argsKolecko, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'kolečko: E2E fail bez jmen',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { vysledek: 'fail', pass: 3, fail: 2, fail_kriteria: [] })
    if (label === 'e2e:kolečko:2') return e2ePass(5)
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.neobsahuje(k.jeden('e2e:kolečko:2'), 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2 na prázdný seznam FAIL')
    k.rovno(v && v.e2e && v.e2e.celkem, 5, 'návrat.e2e.celkem z kola 2')
    return k.chyby
  },
}
