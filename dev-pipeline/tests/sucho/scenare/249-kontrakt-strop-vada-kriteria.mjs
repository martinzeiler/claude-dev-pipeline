// 249 · stavba · 1.12.0 (spec G1, nedodělek první dávky): Kontrakt na stropu předávek dokončují dva agenti souběžně a blok jejich návraty skládá.
// Složení dřív neslo vždy stav hotovo: stav vada-kriteria dílčího agenta se ztratil a řez pokračoval částmi, review a bránou nad kritériem,
// které kód splnit nemůže. Stav i vada_kriteria se propagují: s důkazem se blok po Kontraktu zastaví (zastaveno, faze vada-kriteria, pokus
// se nepočítá), bez důkazu je díl selhaný jako u každého implementačního agenta.
import { argsStavby, casti, kontrola, stub, hash, parsujLabel, S, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const predavka = label => `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md`
const ZBYVA = ['packages/kontrakt/a.ts', 'packages/kontrakt/b.ts', 'packages/kontrakt/c.ts', 'packages/db/migrace/0006.sql']
const VADA = { kriterium: 'AK31 Schéma bez nulovatelných sloupců', dukaz: 'DUKAZ-249: migrace 0006 musí nechat sloupec nulovatelný, jinak spadne na 14 existujících řádcích', navrh: 'NAVRH-249: kritérium omezit na nové sloupce' }
const TEXT = `[řez 05 vadné kritérium] ${VADA.kriterium}: ${VADA.dukaz}; návrh: ${VADA.navrh}`
const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, max_pokusu: 1 }
// Řetěz Kontraktu vyčerpá štafetu (poslední článek nese zbývající soubory), díl b vrátí, co scénář určí.
const retez = dilB => label => {
  const l = parsujLabel(label)
  if (l.typ === 'implement' && l.role === 'kontrakt' && !l.dalsi.length) return stub(label, { stav: 'castecne', predavka: predavka(label), soubory: ['packages/kontrakt/typy.ts'], ...(l.naslednik === 9 ? { zbyvajici_soubory: ZBYVA } : {}) })
  if (label === 'implement:řez 05:kontrakt:1:b') return dilB(label)
  return null
}
const PO_KONTRAKTU = /^implement:řez 05:(část|integrace)|^(review|thermo|verify|deploy|e2e|diagnose):/

export default {
  nazev: 'Kontrakt po stropu předávek: vadné kritérium dílčího agenta se neztratí',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved: retez(l => stub(l, { stav: 'vada-kriteria', testy_zelene: false, soubory: ['packages/db/migrace/0006.sql'], vada_kriteria: VADA, follow_ups: ['FU-249 zbytek po měření'] })),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'vada-kriteria', pokusy: 1, rozhodnuti: [TEXT] })
    const a = k.jeden('implement:řez 05:kontrakt:1:a'), b = k.jeden('implement:řez 05:kontrakt:1:b')
    k.soubezne(a, b)
    k.nic(PO_KONTRAKTU, 'po vadném kritériu z Kontraktu')
    k.ok(/vadné kritérium: AK31 Schéma bez nulovatelných sloupců \(kontrakt \(agent b\)\)/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.rovno(v && v.casti, [{ id: 'K1', hotovo: false }, { id: 'K2', hotovo: false }], 'části se nestavěly')
    k.obsahuje(k.jeden('uzavření:řez 05:zastaveno'), 'FU-249', 'follow-up dílčího agenta v souboru zastavení')
    k.ok(logy.some(l => /^kontrakt \(agent b\): vadné kritérium AK31/.test(l)), `log vady: ${logy.filter(l => /vadné kritérium/.test(l)).join(' | ')}`)
    k.ok(logy.some(l => /^kontrakt: vada-kriteria, \d+ souborů/.test(l)), `log složeného kontraktu: ${logy.filter(l => /^kontrakt:/.test(l)).join(' | ')}`)
    k.ok(logy.some(l => /řez 05 zastaven v pokusu 1: vadné kritérium .*pokus se nepočítá/.test(l)), 'log zastavení')

    // Bez důkazu je díl selhaný: fáze implementace selže jako dřív, žádné zastavení ani otázka majiteli.
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: retez(l => stub(l, { stav: 'vada-kriteria', vada_kriteria: { kriterium: VADA.kriterium, dukaz: '' } })) })
    const m = kontrola(bez.volani)
    m.navrat(bez.vysledek, { ok: true, vysledek: 'selhalo', faze: 'implementace' })
    m.ok(/kontrakt po stropu předávek nedokončen \(agent b: vadné kritérium bez důkazu/.test(S(bez.vysledek && bez.vysledek.detail)), `detail bez důkazu: ${JSON.stringify(bez.vysledek && bez.vysledek.detail)}`)
    m.ok(!(bez.vysledek.rozhodnuti || []).some(x => /vadné kritérium/.test(S(x))), 'bez důkazu žádná otázka majiteli')
    m.nic(/^implement:řez 05:část/, 'části po selhaném Kontraktu')
    k.chyby.push(...m.chyby.map(x => `bez důkazu: ${x}`))

    // Oba díly hotové: složený Kontrakt je hotový a řez běží dál (kontrola, že propagace nezastaví zdravý řez).
    const ok = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: retez(() => null) })
    const z = kontrola(ok.volani)
    z.navrat(ok.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    z.jeden('implement:řez 05:část K1:1'); z.ok(ok.logy.some(l => /^kontrakt: hotovo, \d+ souborů/.test(l)), 'log hotového kontraktu')
    k.chyby.push(...z.chyby.map(x => `hotové díly: ${x}`))

    // Vada jednoho dílu a selhání druhého: vadné kritérium má přednost, blok stojí bez spotřeby pokusu (jako u částí).
    const obe = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => l === 'implement:řez 05:kontrakt:1:a' ? stub(l, { stav: 'selhalo', souhrn: 'díl a spadl' }) : retez(x => stub(x, { stav: 'vada-kriteria', vada_kriteria: VADA }))(l) })
    k.navrat(obe.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'vada-kriteria', rozhodnuti: [TEXT] })
    return k.chyby
  },
}
