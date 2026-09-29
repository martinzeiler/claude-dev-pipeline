// 17 · PRD · architekt vrátí 3 části (§ 2 Tok 1–3, 7): tři autoři souběžně po architektovi, pak souběžně kontrola kostry
// a tři kontroly částí; návrat casti s prd_path každé části, odhad, kontrakt_potreba, e2e_sekce jako objekty.
// Rámec bloku PRD začíná řádkem „Řez 05: blok PRD.“ (§ 1.8) a výřez vize jde architektovi, autorům i kontrolám (§ 2).
import { argsPrd, kontrola, rozhrani, stub, prdCasti } from '../stuby.mjs'

export const CASTI3 = [
  { id: 'K1', nazev: 'Datový model', soubory: ['packages/db/rozpocty/**'], kriteria: ['AK1', 'AK2'], odhad_radku: 1200, zavisi_na: [] },
  { id: 'K2', nazev: 'API', soubory: ['apps/api/src/rozpocty/**'], kriteria: ['AK3'], odhad_radku: 1000, zavisi_na: [] },
  { id: 'K3', nazev: 'UI', soubory: ['apps/web/src/rozpocty/**'], kriteria: ['AK4', 'AK5'], odhad_radku: 1300, zavisi_na: ['K1'] },
]
const SEKCE = [{ nazev: 'Rozpočty API', kriterii: 7 }, { nazev: 'Rozpočty UI', kriterii: 7 }]
const IDS = CASTI3.map(c => c.id)
const MAPA = 'MAPA-VIZE: Proč 1–20 · Cíle 21–60 · Ne-cíle 61–80'

export default {
  nazev: 'architekt vrátí 3 části',
  blok: 'blok-prd',
  args: argsPrd({ mapa_vize: MAPA }),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, e2e_sekce: SEKCE })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, kontrakt_potreba: true, odhad_radku: 3500, e2e_sekce: SEKCE, predavky: 0 })
    const ar = k.jeden('prd:řez 05')
    k.agent(ar, 'dev-pipeline:prd', 'opus', 'high')
    k.pole(ar, ['casti', 'odhad_radku', 'kontrakt_potreba', 'rozdelit_navrh', 'e2e_sekce', 'predavka'], 'PRD_SCHEMA')
    k.obsahuje(ar, 'Kontrakt', 'sekci Kontrakt'); k.obsahuje(ar, MAPA, 'mapu sekcí vize')

    k.pocet(/^prd-část:/, 3, 'autoři částí')
    const au = IDS.map(id => k.jeden(`prd-část:řez 05:${id}`))
    k.vsechnySoubezne(au, 'autoři částí')
    au.forEach((a, i) => {
      k.pred(ar, a)
      k.agent(a, 'dev-pipeline:prd', 'opus', 'high')
      k.obsahuje(a, `rez-05-cast-${IDS[i]}`, `soubor části ${IDS[i]}`)
      if (a) for (const p of ['prd_path', 'kriteria', 'souhrn']) k.ok(a.povinne.includes(p), `${a.label}: CAST_SCHEMA bez povinného ${p}`)
      k.pole(a, ['kontrakt_doplnit', 'spory', 'predavka'], 'CAST_SCHEMA')
    })

    k.pocet(/^prd-check:/, 4, 'kontroly kola 1')
    const ks = k.jeden('prd-check:řez 05:1'), kc = IDS.map(id => k.jeden(`prd-check:řez 05:část ${id}:1`))
    k.vsechnySoubezne([ks, ...kc], 'kontrola kostry a částí')
    for (const a of au) for (const c of [ks, ...kc]) k.pred(a, c)
    k.obsahuje(ks, 'rez-05-prd-check-kolo-1.md', 'report kontroly kostry')
    k.shoda(ks, /disjunkt|žádný soubor ve dvou částech/, 'disjunktnost souborů částí'); k.shoda(ks, /bez cykl/, 'závislosti bez cyklu')
    kc.forEach((c, i) => { k.obsahuje(c, `rez-05-prd-check-cast-${IDS[i]}-kolo-1.md`, 'report kontroly části'); k.obsahuje(c, prdCasti(IDS[i]), 'PRD části') })
    k.nic(/^prd-fix:/, 'zapracování po čistých kontrolách')

    for (const x of volani) {
      k.ok(x.prompt.startsWith('Řez 05: blok PRD.'), `${x.label}: rámec nezačíná „Řez 05: blok PRD.“ (§ 1.8)`)
      k.obsahuje(x, 'Vizi nečti celou', 'výřez vize (§ 2)')
    }
    if (v) {
      k.rovno((v.casti || []).map(c => [c.id, c.prd_path]), IDS.map(id => [id, prdCasti(id)]), 'návrat.casti s prd_path')
      k.rovno((v.casti || []).map(c => [c.nazev, c.soubory, c.zavisi_na]), CASTI3.map(c => [c.nazev, c.soubory, c.zavisi_na]), 'návrat.casti převzaté z architekta')
      k.ok(v.kontrola && v.kontrola.verdikt === 'ready', `návrat.kontrola: ${JSON.stringify(v.kontrola)}`)
    }
    rozhrani(k, volani)
    return k.chyby
  },
}
