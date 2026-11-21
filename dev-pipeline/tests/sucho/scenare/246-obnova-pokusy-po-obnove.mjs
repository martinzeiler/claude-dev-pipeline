// 246 · stavba · 1.12.0 (spec R1): obnova s pokus N bez bez_cache přehrává pokusy před přerušeným od prvního. Když je cache nevrátí (PRD
// zapracované mezi pádem a obnovou mění zadání) a přehrávaný pokus doběhne úspěšně, blok hlásil „hotový na pokus 1“ a pokusy 1, ačkoli šlo
// nejmíň o třetí pokus řezu. Návrat, log, journal i soubor výsledku nesou číslo přerušeného pokusu z obnovy. Zastavení dál vrací číslo
// pokusu smyčky: tím orchestrátor blok obnovuje a od něj platí značka obnovy.
import { argsStavby, casti, kontrola, stub, zelenaBrana, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-246'
const OBNOVA = { od_faze: 'implementace', znacka: Z, pokus: 3 }
const CASTI = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }

export default {
  nazev: 'obnova s pokusem 3: hotový řez hlásí pokus 3',
  blok: 'blok-stavby',
  args: argsStavby({ ...CASTI, obnova: OBNOVA }),
  odpoved: () => null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    // Řez s částmi obnovený od implementace (jako v běhu): cache nevrátila nic, pokus 1 smyčky doběhl živě a úspěšně.
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    k.jeden('implement:řez 05:kontrakt:1'); k.nic(/^implement:řez 05:.*:3$/, 'pokus 3 smyčky se nekonal')
    k.nic(/^diagnose:/, 'diagnóza bez selhání')
    const u = k.jeden('uzavření:řez 05')
    k.obsahuje(u, 'pokusy 3,', 'číslo pokusu v journalu'); k.obsahuje(u, '"pokusy":3', 'číslo pokusu v souboru výsledku'); k.neobsahuje(u, '"pokusy":1', 'pokus smyčky v souboru výsledku')
    k.ok(logy.some(l => l.startsWith('řez 05 hotový na pokus 3 (obnova s pokusem 3: úspěšně doběhl už přehrávaný pokus 1, cache dřívějších pokusů neplatila), commit ')), `log: ${logy.filter(l => /hotový na pokus/.test(l)).join(' | ')}`)

    // Malý řez stejně; se souborem výsledku (seznamy jdou počtem) nese číslo pokusu návrat sám.
    const maly = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: OBNOVA }), odpoved: l => l === 'uzavření:řez 05' ? stub(l, { vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` }) : null })
    k.rovno(maly.vysledek && [maly.vysledek.pokusy, maly.vysledek.vysledek_soubor], [3, `${CWD}/docs/.vysledek-stavba-05.json`], 'malý řez se souborem výsledku: pokusy')
    k.ok(maly.logy.some(l => l.startsWith('řez 05 hotový na pokus 3 (')), `malý řez: log ${maly.logy.filter(l => /hotový na pokus/.test(l)).join(' | ')}`)

    // Přerušený pokus doběhne sám (pokusy 1 a 2 selžou jako v původním běhu): pokus 3 bez dovětku.
    const tri = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'brana', znacka: Z, pokus: 3 } }), odpoved: l => /^verify:řez 05:(p2:)?\d+$/.test(l) ? stub(l, { selhalo: 1, exit_kod: 1, selhavajici: ['x.test.ts'] }) : null })
    k.rovno(tri.vysledek && [tri.vysledek.vysledek, tri.vysledek.pokusy], ['hotovo', 3], 'přerušený pokus 3: návrat')
    k.ok(tri.logy.some(l => l.startsWith('řez 05 hotový na pokus 3, commit ')), `přerušený pokus 3: log ${tri.logy.filter(l => /hotový na pokus/.test(l)).join(' | ')}`)

    // Selhání, které další pokus neopraví (pahýl části mimo stavbu), v přehrávaném pokusu: pokusy nesou číslo z obnovy.
    const konec = await spust({ blok: 'blok-stavby', args: argsStavby({ ...CASTI, obnova: OBNOVA }), odpoved: l => /^verify:/.test(l) ? zelenaBrana({ pahyly: ['apps/sucho/routes/admin.ts:40 neimplementováno: řez 05 část K8'] }) : null })
    k.rovno(konec.vysledek && [konec.vysledek.vysledek, konec.vysledek.faze, konec.vysledek.pokusy], ['selhalo', 'brana', 3], 'konečné selhání v přehrávaném pokusu: pokusy')

    // Bez obnovy je číslo pokusu číslo pokusu smyčky.
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null })
    k.rovno(bez.vysledek && bez.vysledek.pokusy, 1, 'bez obnovy: pokusy')
    k.ok(bez.logy.some(l => l.startsWith('řez 05 hotový na pokus 1, commit ')), 'bez obnovy: log')

    // Zastavení v přehrávaném pokusu vrací číslo pokusu smyčky, kterým orchestrátor blok obnoví.
    const odklad = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: OBNOVA }), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { stav: 'odlozeno', nejdriv: '2026-10-07T02:30:00+02:00', duvod: 'zakázané okno', commit: '' }) : null })
    k.rovno(odklad.vysledek && [odklad.vysledek.vysledek, odklad.vysledek.faze, odklad.vysledek.pokusy], ['zastaveno', 'deploy-odklad', 1], 'zastavení v přehrávaném pokusu: pokusy')
    return k.chyby
  },
}
