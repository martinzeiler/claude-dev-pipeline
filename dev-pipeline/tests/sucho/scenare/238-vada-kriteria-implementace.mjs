// 238 · stavba · 1.12.0 (spec G1 a G2): implementační agent vrátí stav vada-kriteria s důkazem (kód je odevzdaný, kritérium nejde splnit žádným
// kódem, který PRD dovoluje). Část se počítá jako hotová, běžící části doběhnou, nové se nespouštějí a blok se zastaví před integrací,
// review a bránou: vysledek zastaveno, faze vada-kriteria, rozhodnutí s prefixem řezu, pokus se nepočítá. Bez důkazu je stav selhalo.
// Dřív agentovi zbývalo jen castecne, které blok četl jako nedokončenou práci (tři pokusy, diagnóza a osm nástupců nad jedním kritériem).
import { argsStavby, casti, kontrola, stub, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const VADA = { kriterium: 'AK24 Rozpočet světa', dukaz: 'DUKAZ-238: svět vychází na 17 189 tokenů proti prahu 15 500 i po zúžení fixtury', navrh: 'NAVRH-238: práh 17 500' }
const TEXT = `[řez 05 vadné kritérium] ${VADA.kriterium}: ${VADA.dukaz}; návrh: ${VADA.navrh}`
const CASTI = { casti: casti([['K1'], ['K2'], ['K3', ['K1']]]) }
const vada = (l, extra = {}) => stub(l, { stav: 'vada-kriteria', testy_zelene: false, vada_kriteria: VADA, follow_ups: ['FU-238 zbytek po měření'], ...extra })
const STOP = { ok: true, vysledek: 'zastaveno', faze: 'vada-kriteria', pokusy: 1 }

export default {
  nazev: 'vadné kritérium z implementace: zastavení před integrací, bez spotřeby pokusu',
  blok: 'blok-stavby',
  args: argsStavby(CASTI),
  odpoved: l => (l === 'implement:řez 05:část K1:1' ? vada(l) : null),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ...STOP, rozhodnuti: [TEXT] })
    k.nic(/^implement:řez 05:(integrace|část K3)|^(review|thermo|verify|deploy|diagnose):|^implement:řez 05:část K\d:2/, 'po vadném kritériu')
    k.jeden('implement:řez 05:část K2:1')
    k.rovno(v && v.casti, [{ id: 'K1', hotovo: true }, { id: 'K2', hotovo: true }, { id: 'K3', hotovo: false }], 'návrat.casti: část s vadným kritériem je odevzdaná')
    k.ok(/vadné kritérium: AK24 Rozpočet světa \(část K1\)/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    const impl = k.jeden('implement:řez 05:část K1:1')
    k.pole(impl, ['vada_kriteria'], 'IMPL'); k.obsahuje(impl, 'vrať stav vada-kriteria', 'pravidlo v zadání části')
    k.ok(impl && impl.schema.properties.stav.enum.includes('vada-kriteria'), 'stav vada-kriteria ve schématu')
    // Seznamy zastaveného běhu zapíše uzavření v režimu zastaveno; návrat nese cestu.
    const uz = k.jeden('uzavření:řez 05:zastaveno')
    k.obsahuje(uz, 'blok se zastavil ve fázi vada-kriteria', 'fázi zastavení'); k.obsahuje(uz, 'FU-238', 'follow-up části')
    k.ok(v && v.seznamy_zapsane === true && S(v.zastaveno_soubor).includes('zastaveno'), `zastaveno_soubor: ${JSON.stringify(v && v.zastaveno_soubor)}`)
    k.ok(logy.some(l => /řez 05 zastaven v pokusu 1: vadné kritérium .*pokus se nepočítá, blok čeká na obnovu od fáze implementace/.test(l)), 'log zastavení')

    // Všechny části doběhly a jedna nese vadné kritérium: integrace se nespouští.
    const dve = await spust({ blok: 'blok-stavby', args: argsStavby({ casti: casti([['K1'], ['K2']]) }), odpoved: l => (l === 'implement:řez 05:část K1:1' ? vada(l) : null) })
    k.navrat(dve.vysledek, { ...STOP, rozhodnuti: [TEXT] })
    k.rovno(dve.volani.map(x => x.label).sort(), ['implement:řez 05:část K1:1', 'implement:řez 05:část K2:1', 'uzavření:řez 05:zastaveno'], 'dvě hotové části: žádná integrace')

    // Bez důkazu je to selhání části jako dřív.
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby({ ...CASTI, max_pokusu: 1 }), odpoved: l => (l === 'implement:řez 05:část K1:1' ? vada(l, { vada_kriteria: { kriterium: VADA.kriterium, dukaz: '' } }) : null) })
    k.navrat(bez.vysledek, { ok: true, vysledek: 'selhalo', faze: 'implementace' })
    k.ok(/vadné kritérium bez důkazu/.test(S(bez.vysledek && bez.vysledek.detail)) && bez.logy.some(l => /stav vada-kriteria bez důkazu/.test(l)), `bez důkazu: ${JSON.stringify(bez.vysledek && bez.vysledek.detail)}`)

    // Vadné kritérium má přednost před selháním jiné části: blok stojí bez spotřeby pokusu.
    const obe = await spust({ blok: 'blok-stavby', args: argsStavby(CASTI), odpoved: l => (l === 'implement:řez 05:část K1:1' ? vada(l) : l === 'implement:řez 05:část K2:1' ? stub(l, { stav: 'selhalo', souhrn: 'K2 spadla' }) : null) })
    k.navrat(obe.vysledek, { ...STOP, rozhodnuti: [TEXT] })

    // Integrace s vadným kritériem: části i integrace odevzdané, blok stojí před review.
    const integ = await spust({ blok: 'blok-stavby', args: argsStavby(CASTI), odpoved: l => (l === 'implement:řez 05:integrace:1' ? vada(l) : null) })
    k.navrat(integ.vysledek, { ...STOP, rozhodnuti: [TEXT] })
    k.ok(!integ.volani.some(x => /^(review|thermo|verify):/.test(x.label)), 'integrace: žádné review ani brána')

    // Malý řez: jedno volání, nic k zápisu; obnova od fáze vada-kriteria (= implementace) pustí implementaci živě a řez doběhne.
    const maly = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => (l === 'implement:řez 05:1' ? vada(l, { follow_ups: [] }) : null) })
    k.navrat(maly.vysledek, { ...STOP, rozhodnuti: [TEXT], seznamy_zapsane: true })
    k.rovno(maly.volani.map(x => x.label), ['implement:řez 05:1'], 'malý řez: jen implementace')
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'vada-kriteria', znacka: 'Z238', pokus: 1 } }), odpoved: () => null }, { cache: maly.volani })
    const o = kontrola(obnova.volani)
    o.navrat(obnova.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const io = o.jeden('implement:řez 05:1')
    o.ok(io && !io.z_cache, 'implementace po obnově živě'); o.obsahuje(io, 'Obnova běhu (Z238)', 'značku obnovy')
    k.chyby.push(...o.chyby.map(c => `obnova: ${c}`))
    return k.chyby
  },
}
