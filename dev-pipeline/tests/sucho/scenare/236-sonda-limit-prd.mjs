// 236 · PRD · 1.12.0 (spec F3): blok PRD bez jediné kontroly nevrací ok: true s kontrola: null (vypadalo to jako schválitelné PRD): končí
// ok: false s fází kontrola a zapracování nespouští. Když agenti neodpovídají ani na sondu (limit účtu), končí s fází agenti. Jedna
// chybějící kontrola z více blok dál nezastaví (kontrola.bez_kontroly).
import { argsPrd, kontrola, stub, CWD, PLUGIN, NIC, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const sCastmi = l => (l === 'prd:řez 05' ? stub(l, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true }) : null)
const limitOd = re => l => (re.test(l.replace(/^sonda:/, '')) ? NIC : null)

export default {
  nazev: 'PRD: kontrola bez výsledku a limit účtu',
  blok: 'blok-prd',
  args: argsPrd(),
  // Malý řez, kontrola nevrátí výsledek, sonda odpoví.
  odpoved: l => (l === 'prd-check:řez 05:1' ? NIC : null),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, rez: '05', faze: 'kontrola', duvod: 'kontrola PRD neproběhla (1 kontrol bez výsledku)' })
    k.ok(S(v && v.prd_path).includes('rez-05'), `návrat.prd_path: ${JSON.stringify(v && v.prd_path)}`)
    k.pocet(/^prd-check:řez 05:1$/, 3, 'tři volání kontroly'); k.pocet(/^sonda:prd-check:řez 05:1$/, 1, 'sonda po třetím')
    k.nic(/^prd-fix:/, 'zapracování bez kontroly')
    k.ok(logy.some(l => /kontrola PRD neproběhla \(1 kontrol bez výsledku\): blok končí bez zapracování/.test(l)), 'log')

    // Řez s částmi: bez výsledku kostra i všechny části.
    const vse = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: l => sCastmi(l) || (/^prd-check:/.test(l) ? NIC : null) })
    k.navrat(vse.vysledek, { ok: false, faze: 'kontrola', duvod: `kontrola PRD neproběhla (${1 + CASTI3.length} kontrol bez výsledku)` })
    k.ok(!vse.volani.some(x => /^prd-fix:/.test(x.label)), 'části: zapracování bez kontroly')

    // Chybí jen kontrola jedné části: blok doběhne a část jmenuje v kontrola.bez_kontroly.
    const jedna = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: l => sCastmi(l) || (l === `prd-check:řez 05:část ${CASTI3[0].id}:1` ? NIC : null) })
    k.navrat(jedna.vysledek, { ok: true })
    k.rovno(jedna.vysledek && jedna.vysledek.kontrola && jedna.vysledek.kontrola.bez_kontroly, [CASTI3[0].id], 'kontrola.bez_kontroly')

    // Limit účtu: kontroly i sondy bez výsledku.
    const limit = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: l => sCastmi(l) || limitOd(/^prd-check:/)(l) })
    const m = kontrola(limit.volani)
    m.navrat(limit.vysledek, { ok: false, rez: '05', faze: 'agenti' })
    m.ok(/agenti neběží/.test(S(limit.vysledek && limit.vysledek.duvod)), `návrat.duvod: ${JSON.stringify(limit.vysledek && limit.vysledek.duvod)}`)
    m.nic(/^prd-fix:/, 'zapracování při limitu')
    m.ok(limit.volani.some(x => /^sonda:prd-check:/.test(x.label)), 'sonda po kontrole')
    k.chyby.push(...m.chyby.map(c => `limit u kontroly: ${c}`))

    // Limit už u architekta a v režimu zapracování.
    const arch = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: limitOd(/^prd:/) })
    k.navrat(arch.vysledek, { ok: false, faze: 'agenti' })
    k.rovno(arch.volani.map(x => x.label), ['prd:řez 05', 'prd:řez 05', 'prd:řez 05', 'sonda:prd:řez 05'], 'architekt: tři volání a sonda')
    const zapr = await spust({ blok: 'blok-prd', args: argsPrd({ rezim: 'zapracovani', prd_path: '/sucho/projekt/docs/prd/rez-05-sucho.md', nalezy: ['N-236: bod F2 chybí v rozsahu'] }), odpoved: limitOd(/^prd-fix:/) })
    k.navrat(zapr.vysledek, { ok: false, faze: 'agenti' })

    // Limit u delta kontroly: návrat není ok: true s nedokončenou kontrolou.
    const delta = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: l => (l === 'prd-check:řez 05:1' ? stub(l, { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, nalezy_ids: ['N1', 'N2'] }) : limitOd(/^prd-check:řez 05:2$/)(l)) })
    k.navrat(delta.vysledek, { ok: false, faze: 'agenti' })
    k.ok(delta.volani.some(x => x.label === 'prd-fix:řez 05'), 'zapracování před deltou proběhlo')

    // Limit už u načtení args (review N5): tři volání načítacího agenta a sonda bez odpovědi vrátí ok: false s fází agenti.
    const ARGS_FILE = { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: `${CWD}/docs/.prd-05.json` }
    const nacteni = await spust({ blok: 'blok-prd', args: ARGS_FILE, odpoved: limitOd(/^args:/) })
    k.navrat(nacteni.vysledek, { ok: false, rez: '05', faze: 'agenti' })
    k.ok(/agenti neběží: args:řez 05: tři volání bez výsledku a sonda bez odpovědi/.test(S(nacteni.vysledek && nacteni.vysledek.duvod)), `načtení: ${JSON.stringify(nacteni.vysledek)}`)
    k.rovno(nacteni.volani.map(x => x.label), ['args:řez 05', 'args:řez 05', 'args:řez 05', 'sonda:args:řez 05'], 'načtení args: tři volání a sonda')
    const nactSonda = await spust({ blok: 'blok-prd', args: ARGS_FILE, odpoved: l => (/^args:/.test(l) ? NIC : null) })
    k.ok(nactSonda.vysledek && nactSonda.vysledek.ok === false && !nactSonda.vysledek.faze, `sonda odpověděla: obecné ok: false bez fáze (${JSON.stringify(nactSonda.vysledek)})`)
    return k.chyby
  },
}
