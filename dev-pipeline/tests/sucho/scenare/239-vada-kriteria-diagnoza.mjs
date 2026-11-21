// 239 · stavba · 1.12.0 (spec G3): diagnóza po dvou neúspěších, která s důkazem určí, že příčinou je samo kritérium (mimo krok po nasazení),
// zastaví blok místo třetího pokusu: vysledek zastaveno, faze vada-kriteria, rozhodnutí s prefixem a diagnoza.vada_kriteria v návratu.
// Dřív blok vadu kritéria z diagnózy mimo krok po nasazení zahodil a třetí pokus běžel nadarmo. Zadání diagnózy žádá vada_kriteria vždy.
// Obnova do třetího pokusu (kritérium je rozhodnuté) diagnózu přehraje z cache a pokus pustí.
import { argsStavby, casti, kontrola, stub, pokusZ, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { casti: casti([['K1'], ['K2']]) }
const VADA = { kriterium: 'AK24 Rozpočet světa', druh: 'práh nad mechanismem', dukaz: 'DUKAZ-239: rozpocet.test.ts:40 měří 17 189 proti 15 500', navrh: 'NAVRH-239: práh 17 500' }
const DIAG = { pricina: 'kód je v pořádku, chyba je v kritériu', doporuceni: 'DOPORUCENI-239 změnit práh', smycka_postavena: true }
// Integrace selže v pokusu 1 a 2 (v ostrém běhu castecne bez předávky dvakrát za sebou); od pokusu 3 by prošla.
const odpoved = (diag, integraceOd = 3) => (l, p, o, stav) => {
  if (/^implement:řez 05:integrace:/.test(l) && pokusZ(stav) < integraceOd) return stub(l, { stav: 'selhalo', souhrn: 'INTEGRACE-239 test rozpočtu červený' })
  if (l === 'diagnose:řez 05') return diag
  return null
}

export default {
  nazev: 'vadné kritérium z diagnózy mimo krok: třetí pokus neběží',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved: odpoved({ ...DIAG, vada_kriteria: VADA }),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'vada-kriteria', pokusy: 3, rozhodnuti: [`[řez 05 vadné kritérium] ${VADA.kriterium}: ${VADA.dukaz}; návrh: ${VADA.navrh}`] })
    k.nic(/^implement:řez 05:[^:]+:3$|^implement:řez 05:3$|^(deploy|e2e):|^uzavření:řez 05(:selhání)?$/, 'třetí pokus a uzavření po vadném kritériu z diagnózy')
    k.rovno(v && v.diagnoza && v.diagnoza.vada_kriteria, VADA, 'návrat.diagnoza.vada_kriteria')
    k.ok(v && v.diagnoza && v.diagnoza.pricina === DIAG.pricina, `návrat.diagnoza.pricina: ${JSON.stringify(v && v.diagnoza)}`)
    const d = k.jeden('diagnose:řez 05')
    k.pole(d, ['vada_kriteria'], 'DIAG'); k.obsahuje(d, 'vrať i vada_kriteria', 'pravidlo v zadání diagnózy i mimo krok po nasazení'); k.obsahuje(d, 'třetí pokus pak neběží', 'následek')
    k.ok(logy.some(l => /pokus 3: diagnóza určila vadu kritéria/.test(l)), 'log')

    // Jen druh a důkaz: kritérium nese druh, návrh doporučení diagnózy.
    const druh = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: odpoved({ ...DIAG, vada_kriteria: { druh: VADA.druh, dukaz: VADA.dukaz } }) })
    k.rovno(druh.vysledek && druh.vysledek.rozhodnuti, [`[řez 05 vadné kritérium] ${VADA.druh}: ${VADA.dukaz}; návrh: ${DIAG.doporuceni}`], 'rozhodnutí jen z druhu a důkazu')

    // Bez vady kritéria i s vadou bez důkazu jde třetí pokus celý.
    for (const [jmeno, diag] of [['bez vada_kriteria', DIAG], ['vada bez důkazu', { ...DIAG, vada_kriteria: { druh: VADA.druh, dukaz: '' } }]]) {
      const b = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: odpoved(diag) })
      k.ok(b.vysledek && b.vysledek.vysledek === 'hotovo' && b.vysledek.pokusy === 3 && b.volani.some(x => x.label === 'implement:řez 05:integrace:3'), `${jmeno}: třetí pokus má běžet (${JSON.stringify(b.vysledek && [b.vysledek.vysledek, b.vysledek.pokusy])})`)
    }

    // Obnova do třetího pokusu po rozhodnutí kritéria: pokusy 1 a 2 i diagnóza z cache, třetí pokus živě se značkou.
    const obn = { obnova: { od_faze: 'vada-kriteria', znacka: 'Z239', pokus: 3 } }
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, ...obn }), odpoved: odpoved({ ...DIAG, vada_kriteria: VADA }) }, { cache: volani })
    const o = kontrola(obnova.volani)
    o.navrat(obnova.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    o.ok(o.jeden('diagnose:řez 05').z_cache, 'diagnóza z cache')
    const i3 = o.jeden('implement:řez 05:integrace:3')
    o.ok(i3 && !i3.z_cache, 'integrace třetího pokusu živě'); o.obsahuje(i3, 'Obnova běhu (Z239)', 'značku obnovy'); o.obsahuje(i3, 'Diagnóza po dvou neúspěších', 'diagnózu')
    k.chyby.push(...o.chyby.map(c => `obnova: ${c}`))
    // Když třetí pokus po obnově selže, selhaný návrat nese diagnózu i s vadou kritéria.
    const sel = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, ...obn }), odpoved: odpoved({ ...DIAG, vada_kriteria: VADA }, 4) }, { cache: volani })
    k.navrat(sel.vysledek, { ok: true, vysledek: 'selhalo', pokusy: 3, faze: 'implementace' })
    k.ok(S(sel.vysledek && sel.vysledek.diagnoza && sel.vysledek.diagnoza.vada_kriteria && sel.vysledek.diagnoza.vada_kriteria.dukaz).includes('DUKAZ-239'), `selhání po obnově: ${JSON.stringify(sel.vysledek && sel.vysledek.diagnoza)}`)
    return k.chyby
  },
}
