// 225 · kolečko · 1.11.0 (spec G2): obnova.jen_kriteria přeměří jmenovaná, ostatní verdikty převezme z minulého kola a počty složí, přeměřené kritérium
// se nepočítá dvakrát. pokyn_orchestratora se netiskne jako rozhodnutí majitele; rozhodnutí z obnovy se přidávají. Bez verdiktů se měří všechno.
import { argsKolecko, kontrola, e2ePass } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const OBNOVA = { od_faze: 'deploy', znacka: 'Z225', jen_kriteria: ['AK2', 'AK5'], pokyn_orchestratora: 'POKYN-225', rozhodnuti_majitele: ['ROZH-NOVE'] }
const MINULE = { kriteria: [{ kriterium: 'AK1 A', verdikt: 'pass' }, { kriterium: 'AK2 B', verdikt: 'castecne', popis: 'půlka' }, { kriterium: 'AK3 C', verdikt: 'pass' }, { kriterium: 'AK4 D', verdikt: 'castecne', popis: 'půlka D' }, { kriterium: 'AK5 E', verdikt: 'fail', popis: 'padá' }], report_path: '/r/minule.md' }
const ARGS = argsKolecko({ rozhodnuti_majitele: ['ROZH-STARE'], obnova: OBNOVA })

export default {
  nazev: 'kolečko: obnova jen vybraných kritérií',
  blok: 'blok-kolecko',
  args: ARGS,
  odpoved: l => l === 'e2e-stav:kolečko' ? MINULE : l === 'e2e:kolečko:1' ? e2ePass(2, { report_path: '/r/obnova.md' }) : null,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const e = k.jeden('e2e:kolečko:1')
    k.pred(k.jeden('e2e-stav:kolečko'), e)
    k.obsahuje(e, 'přeměř VÝHRADNĚ tato kritéria: AK2 | AK5', 'výběr kritérií'); k.obsahuje(e, 'kolecko-e2e-obnova-1.md', 'vlastní report')
    k.rovno(v && v.e2e && [v.e2e.celkem, v.e2e.pass, v.e2e.castecne, v.e2e.fail, v.e2e.vysledek, v.e2e.prenesena_kriteria], [5, 4, 1, 0, 'pass-castecne', 3], 'složené počty')
    k.obsahuje(e, 'Pokyn orchestrátora pro tuto obnovu (provozní, ne rozhodnutí majitele): POKYN-225', 'pokyn orchestrátora')
    k.obsahuje(e, 'ROZH-STARE | ROZH-NOVE', 'rozhodnutí se přidávají')
    k.neobsahuje(k.jeden('thermo:kolečko'), 'POKYN-225', 'pokyn před hranicí obnovy')
    const bez = await spust({ blok: 'blok-kolecko', args: ARGS, odpoved: l => l === 'e2e-stav:kolečko' ? { kriteria: [] } : null })
    const m = kontrola(bez.volani)
    m.neobsahuje(m.jeden('e2e:kolečko:1'), 'přeměř VÝHRADNĚ tato kritéria', 'výběr bez verdiktů minulého kola')
    k.chyby.push(...m.chyby)
    return k.chyby
  },
}
