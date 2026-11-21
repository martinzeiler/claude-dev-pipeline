// 241 · stavba a kolečko · 1.12.0 (spec K1): soubor výsledku nese rozhodnuti a spory celé (dřív je neměl vůbec, ačkoli je návrat nad limitem
// krátil a ubíral). Návrat nad limitem nejdřív zkrátí vadná kritéria v e2e (rozhodnuti je opakuje s prefixem) na 160 znaků, rozhodnutí
// krátí a ubírá až poslední a log nese položky v původním znění, ne useknuté na 240 znaků.
import { argsStavby, argsKolecko, kontrola, stub, e2ePass, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const vadne = (i, n) => `AK${20 + i} Denní souhrn ${i}: zdroj spotřebován vlastní chybou, ${'v'.repeat(n)} KONEC-241-${i}`
const SPOR = 'SPOR-241 architekt zúžil bod F8 na konverze'
const odpoved = (kriteria, soubor = true) => l => {
  if (l === 'implement:řez 05:1') return stub(l, { spory: [SPOR] })
  if (l === 'e2e:řez 05:1') return e2ePass(8, { pass: 8 - kriteria.length, vadna_kriteria: kriteria })
  if (l === 'uzavření:řez 05') return stub(l, soubor ? { vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` } : {})
  return null
}
const DVE = [vadne(1, 1400), vadne(2, 1400)]
const CTYRI = [1, 2, 3, 4].map(i => vadne(i, 1700))

export default {
  nazev: 'zkrácená pole: soubor výsledku nese rozhodnuti a spory celé',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: odpoved(DVE),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` })
    const n = JSON.stringify(v || {}).length
    k.ok(n <= 5800, `návrat má ${n} znaků`)
    // Zadání uzavření nese pro soubor výsledku celé rozhodnuti i spory.
    const uz = k.jeden('uzavření:řez 05')
    for (const i of [1, 2]) k.obsahuje(uz, `KONEC-241-${i}"`, `celé rozhodnutí ${i} v JSON souboru výsledku`)
    k.obsahuje(uz, '"rozhodnuti":["[řez 05 vadné kritérium] AK21 Denní souhrn 1', 'pole rozhodnuti v souboru výsledku'); k.obsahuje(uz, `"spory":["${SPOR}"]`, 'pole spory v souboru výsledku')
    // Dvě dlouhá vadná kritéria: stačí zkrátit jejich kopii v e2e, rozhodnutí zůstávají v návratu celá a nic se neubírá.
    k.ok(v && v.e2e && v.e2e.vadna_kriteria.length === 2 && v.e2e.vadna_kriteria.every(x => x.length <= 160), `e2e.vadna_kriteria zkrácená na 160: ${JSON.stringify(v && v.e2e && v.e2e.vadna_kriteria.map(x => x.length))}`)
    k.rovno(v && v.rozhodnuti, DVE.map(x => `[řez 05 vadné kritérium] ${x}`), 'návrat.rozhodnuti celá')
    k.ok(v && !('zkraceno' in v), `zkraceno: ${JSON.stringify(v && v.zkraceno)}`)
    k.ok(logy.some(l => /e2e\.vadna_kriteria zkrácena na 160 znaků, celé znění: /.test(l) && l.includes('KONEC-241-1') && l.includes('KONEC-241-2')), 'log s celým zněním zkrácených vadných kritérií')

    // Čtyři dlouhá vadná kritéria se do návratu nevejdou: rozhodnutí se zkrátí a uberou až poslední, zkraceno je počítá a log je nese celá.
    const moc = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: odpoved(CTYRI) })
    const m = kontrola(moc.volani)
    const mv = moc.vysledek || {}
    m.ok(JSON.stringify(mv).length <= 5800, `návrat má ${JSON.stringify(mv).length} znaků`)
    m.ok(mv.zkraceno && mv.zkraceno.rozhodnuti === 4 && Object.keys(mv.zkraceno).length === 1, `zkraceno jen rozhodnuti (4 položky nejsou celé): ${JSON.stringify(mv.zkraceno)}`)
    m.ok((mv.rozhodnuti || []).length >= 1 && mv.rozhodnuti.every(x => x.length <= 240), `rozhodnutí v návratu zkrácená na 240: ${JSON.stringify((mv.rozhodnuti || []).map(x => x.length))}`)
    for (const i of [1, 2, 3, 4]) {
      m.ok(moc.logy.some(l => /návrat nad limitem: rozhodnuti/.test(l) && l.includes(`KONEC-241-${i}`)), `log nese celé rozhodnutí ${i}`)
      m.obsahuje(m.jeden('uzavření:řez 05'), `KONEC-241-${i}"`, `celé rozhodnutí ${i} v souboru výsledku`)
    }
    k.chyby.push(...m.chyby.map(c => `čtyři kritéria: ${c}`))

    // Kolečko: soubor výsledku závěru nese rozhodnuti a spory, log ubraných položek je v původním znění.
    const VADNA = Array.from({ length: 12 }, (_, i) => vadne(i + 1, 900))
    const kol = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => {
      if (l === 'e2e:kolečko:1') return e2ePass(20, { pass: 8, vadna_kriteria: VADNA, report_path: `${CWD}/e2e.md` })
      if (l === 'závěr:kolečko') return { ok: true, review_passed: true, chybejici_commity: [], vysledek_soubor: `${CWD}/docs/.vysledek-kolecko.json` }
      return null
    } })
    const o = kontrola(kol.volani)
    const kv = kol.vysledek || {}
    o.ok(JSON.stringify(kv).length <= 5800, `návrat má ${JSON.stringify(kv).length} znaků`)
    const zaver = o.jeden('závěr:kolečko')
    o.obsahuje(zaver, '"rozhodnuti":["[vadné kritérium E2E kolečka] AK21 Denní souhrn 1', 'pole rozhodnuti v souboru výsledku kolečka'); o.obsahuje(zaver, '"spory":[', 'pole spory v souboru výsledku kolečka')
    o.obsahuje(zaver, 'KONEC-241-12 · návrh', 'celé poslední rozhodnutí v souboru výsledku')
    o.ok(kv.zkraceno && kv.zkraceno.rozhodnuti > 0, `zkraceno.rozhodnuti: ${JSON.stringify(kv.zkraceno)}`)
    o.ok(kol.logy.some(l => /návrat nad limitem: rozhodnuti/.test(l) && l.includes('KONEC-241-12 · návrh')), 'log kolečka nese rozhodnutí v původním znění')
    k.chyby.push(...o.chyby.map(c => `kolečko: ${c}`))
    return k.chyby
  },
}
