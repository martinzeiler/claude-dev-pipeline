// 242 · stavba · 1.12.0 (spec H1): návrat nese jedno číslo předávek, pole predavky (nástupci spuštění tímto voláním bloku: předávka hooku
// i castecne bez předávky, přes všechny pokusy). Volný text kontext počty předávek nenese: číslo bloku i číslo z logu jdou jen do journalu.
// Dřív návrat nesl tři údaje ve dvou polích a tvar věty v poli kontext se běh od běhu lišil.
import { argsStavby, kontrola, stub, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const PREDAVKA = `${CWD}/docs/reviews/predavka-a242.md`

export default {
  nazev: 'uzavření: pole kontext bez počtů předávek',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 2 }),
  odpoved(label, p, o, stav) {
    // Pokus 1: předávka hooku a castecne bez předávky (dva nástupci), pak brána dvakrát červená; pokus 2 bez nástupců.
    if (label === 'implement:řez 05:1') return stub(label, { stav: 'castecne', predavka: PREDAVKA })
    if (label === 'implement:řez 05:1:n2') return stub(label, { stav: 'castecne' })
    if (/^verify:řez 05:[12]$/.test(label)) return stub(label, { selhalo: 2, exit_kod: 1, selhavajici: ['a.test.ts'] })
    if (label === 'uzavření:řez 05') return stub(label, { kontext: 'KONTEXT-242 implement 212 k, 0 compactů, čtení 40 kB' })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2, predavky: 2, kontext: 'KONTEXT-242 implement 212 k, 0 compactů, čtení 40 kB' })
    k.jeden('implement:řez 05:1:n3')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, 'předávky bloku stavby: 2 (ze zadání)', 'číslo předávek bloku do journalu')
    k.obsahuje(uz, 'obě čísla předávek zapiš do journalu s popiskem', 'obě čísla jen do journalu')
    k.obsahuje(uz, 'v poli kontext vrať jen nejvyšší hodnotu podle typu agenta, počet compactů a čtení, počty předávek sem nepiš', 'větu o poli kontext')
    k.neobsahuje(uz, 'tentýž souhrn vrať v poli kontext', 'dřívější větu')
    k.ok(uz && /počty předávek sem nepiš/.test(uz.schema.properties.kontext.description), `popis pole kontext: ${uz && uz.schema.properties.kontext.description}`)

    // Režim selhání: kontext jako u běžného uzavření, bez počtů předávek.
    const sel = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => (l === 'implement:řez 05:1' ? stub(l, { stav: 'selhalo', souhrn: 'spadlo', follow_ups: ['FU-242'] }) : null) })
    const s = kontrola(sel.volani)
    s.obsahuje(s.jeden('uzavření:řez 05:selhání'), 'jako u běžného uzavření (bez počtů předávek)', 'větu v režimu selhání')
    k.chyby.push(...s.chyby)

    // Po obnově jen nástupci od obnovené fáze (review N4): nástupce implementace z cache se do predavky nepočítá, živý za hranicí ano.
    const odp = l => (l === 'implement:řez 05:1' ? stub(l, { stav: 'castecne', predavka: PREDAVKA }) : null)
    const prvni = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: odp })
    k.rovno(prvni.vysledek && prvni.vysledek.predavky, 1, 'přerušený běh: jedna předávka')
    const odDeploye = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z242', pokus: 1 } }), odpoved: odp }, { cache: prvni.volani })
    k.ok(odDeploye.volani.some(x => x.label === 'implement:řez 05:1:n2' && x.z_cache), 'nástupce implementace z cache')
    k.rovno(odDeploye.vysledek && odDeploye.vysledek.predavky, 0, 'obnova od deploye: nástupce z cache se nepočítá')
    const odImpl = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'implementace', znacka: 'Z242', pokus: 1 } }), odpoved: odp }, { cache: prvni.volani })
    k.rovno(odImpl.vysledek && odImpl.vysledek.predavky, 1, 'obnova od implementace: živý nástupce se počítá')
    return k.chyby
  },
}
