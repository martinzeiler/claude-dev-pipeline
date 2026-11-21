// 237 · kolečko · 1.12.0 (spec F1 a F2): limit účtu není selhání kolečka. Tři volání bez výsledku a sonda bez odpovědi zastaví kolečko
// s fází agenti (bez obnova_od: obnova jde přes resumeFromRunId se stejnými args); závěr neběží. Když sonda odpoví, platí dřívější
// selhání fáze. Obnova přes cache po resetu limitu doběhne.
import { argsKolecko, kontrola, e2ePass, CWD, PLUGIN, NIC, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const limitOd = re => l => (re.test(l.replace(/^sonda:/, '')) ? NIC : null)
const AGENTI = { ok: true, vysledek: 'zastaveno', faze: 'agenti', infra: true, infra_trida: 'ucet', review_passed: false }

export default {
  nazev: 'limit účtu: sonda bez odpovědi zastaví kolečko s fází agenti',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: limitOd(/^thermo:/),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ...AGENTI, follow_ups: [], odmitnute: [], reports: [] })
    k.ok(v && !('obnova_od' in v), `návrat bez obnova_od: ${JSON.stringify(v && v.obnova_od)}`)
    k.rovno(volani.map(x => x.label), ['thermo:kolečko', 'thermo:kolečko', 'thermo:kolečko', 'sonda:thermo:kolečko'], 'tři volání a sonda, nic dalšího')
    const s = k.jeden('sonda:thermo:kolečko')
    k.ok(s && s.model === volani[0].model && s.effort === 'low' && !s.klice.length, `sonda na modelu selhaného volání, effort low, bez schématu: ${JSON.stringify(s && [s.model, s.effort, s.klice])}`)
    k.ok(/agenti neběží/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(logy.some(l => /kolečko zastaveno: agenti neběží/.test(l)) && !logy.some(l => /kolečko selhalo/.test(l)), 'log zastavení, ne selhání')

    // Sonda odpoví: selhání fáze thermo jako dřív.
    const zive = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => (l === 'thermo:kolečko' ? NIC : null) })
    k.navrat(zive.vysledek, { ok: true, vysledek: 'selhalo', faze: 'thermo', obnova_od: 'thermo' })

    // Limit uprostřed (brána před nasazením): žádný deploy, E2E ani závěr; obnova přes cache doběhne bez sondy.
    const brana = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: limitOd(/^verify:/) })
    const b = kontrola(brana.volani)
    b.navrat(brana.vysledek, AGENTI)
    b.nic(/^(deploy|e2e|závěr|fix-brana):/, 'po limitu u brány')
    k.chyby.push(...b.chyby.map(c => `limit u brány: ${c}`))
    const obnova = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: () => null }, { cache: brana.volani })
    const o = kontrola(obnova.volani)
    o.navrat(obnova.vysledek, { ok: true, vysledek: 'hotovo', review_passed: true })
    o.nic(/^sonda:/, 'sonda při obnově')
    o.ok(o.jeden('thermo:kolečko').z_cache, 'thermo z cache')
    k.chyby.push(...o.chyby.map(c => `obnova po limitu: ${c}`))

    // Limit až u závěru: kolečko není „hotovo“ bez závěru.
    const zaver = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: limitOd(/^závěr:/) })
    k.navrat(zaver.vysledek, AGENTI)
    k.ok(!zaver.volani.some(x => /^commit:kolečko:závěr/.test(x.label)), 'commit závěru při limitu')

    // Výpadek vyrobí vlastní položky (neopravený bezpečnostní nález jako otázka majiteli, review N3): návrat s fází agenti nese rozhodnuti,
    // spory, prostředí i kandidáty prázdné jako follow_ups; obnova z cache je vyrobí znovu. Obnova z args jde do návratu (review N2 stavby).
    const OBN = { od_faze: 'deploy', znacka: 'Z237' }
    const sec = await spust({ blok: 'blok-kolecko', args: argsKolecko({ obnova: OBN }), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(5, { zavazne_mimo_ak: ['IDOR v /api/x'] }) : /^fix-security:kolečko:e2e$/.test(l.replace(/^sonda:/, '')) ? NIC : null })
    k.navrat(sec.vysledek, { ...AGENTI, rozhodnuti: [], spory: [], prostredi: [], follow_ups: [], obnova: OBN })
    k.ok(sec.vysledek && !('kandidati_minirezu' in sec.vysledek), 'kandidáti mini-řezu při fázi agenti')

    // Limit už u načtení args (review N5): tři volání načítacího agenta a sonda bez odpovědi zastaví kolečko s fází agenti.
    const ARGS_FILE = { cwd: CWD, plugin_root: PLUGIN, args_file: `${CWD}/docs/.kolecko.json` }
    const nacteni = await spust({ blok: 'blok-kolecko', args: { ...ARGS_FILE, obnova: OBN }, odpoved: limitOd(/^args:/) })
    k.navrat(nacteni.vysledek, { ...AGENTI, rozhodnuti: [], follow_ups: [], obnova: OBN })
    k.rovno(nacteni.volani.map(x => x.label), ['args:kolečko', 'args:kolečko', 'args:kolečko', 'sonda:args:kolečko'], 'načtení args: tři volání a sonda')
    const nactSonda = await spust({ blok: 'blok-kolecko', args: ARGS_FILE, odpoved: l => (/^args:/.test(l) ? NIC : null) })
    k.navrat(nactSonda.vysledek, { ok: false })
    return k.chyby
  },
}
