// 219 · kolečko · 1.11.0 (spec D3): čitelnost z E2E kolečka nespouští opravný cyklus; jde do follow-ups [oprava] a jmenovitě do návratu.
// 1.12.0 (spec N2): várky čitelnosti na začátku fáze Dluh berou položky z follow-ups (z E2E řezů a dřívějších koleček). Vady z E2E téhož kolečka
// vznikají až po fázi Dluh: jdou do follow-ups jako dřív, ve tvaru, který sběr čitelnosti pozná (text za značkami začíná „čitelnost:“),
// a vezme je mini-řez nebo příští kolečko. Počty dluh.citelnost se jimi nemění.
import { argsKolecko, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'kolečko: čitelnost z E2E bez opravného cyklu',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(5, { citelnost: [{ plocha: 'Přehled', co: 'zkratka bez vysvětlení', proc: '' }] }) : null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^(fix-e2e|fix-citelnost|e2e:kolečko:2)/, 'opravný cyklus kvůli čitelnosti')
    k.obsahuje(k.jeden('závěr:kolečko'), '"[kolečko · E2E] [oprava] čitelnost: Přehled: zkratka bez vysvětlení"', 'follow-up ve tvaru pro sběr čitelnosti')
    k.rovno(v && v.e2e && v.e2e.vysledek, 'pass', 'verdikt beze změny')
    k.rovno(v && v.e2e && [v.e2e.citelnost, v.e2e.citelnost_pocet], [['Přehled: zkratka bez vysvětlení'], 1], 'jmenovitě v návratu')
    // Sběr čitelnosti proběhl na začátku fáze Dluh, před E2E: vada z E2E do várky téhož kolečka nejde a počty čitelnosti dluhu zůstávají nulové.
    k.pred(k.jeden('dluh:kolečko:čitelnost'), k.jeden('e2e:kolečko:1'))
    k.nic(/^(fix|verify|commit):kolečko:dluh čitelnost/, 'várka čitelnosti nad vadou z E2E téhož kolečka')
    k.rovno(v && v.dluh && v.dluh.citelnost, { polozek: 0, opraveno: 0, zbyva: 0 }, 'dluh.citelnost')
    k.ok(logy.some(l => /E2E: 1 vad čitelnosti jde do follow-ups a do zprávy, opravný cyklus se nekoná/.test(l)), 'log')
    return k.chyby
  },
}
