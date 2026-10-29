// 189 · stavba · 1.10.0 (spec F1, review N5, N19): obnova řezu s částmi od uzavření podle stavu jde rovnou na uzavření jen nad čistým E2E
// přerušeného běhu (pass nebo pass-castecne, bez FAIL a bez vadných kritérií), s nasazením HEAD a čistým stromem; dveře a dosah vezme
// ze zápisu nasazení přes obnova-stav. E2E s vadným kritériem, nebo bez výsledku, pošle obnovu na E2E: majitel dostane otázku.
import { argsStavby, casti, hash, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-189'
const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, obnova: { od_faze: 'uzavreni', znacka: Z, pokus: 1 } }
const E2E = { vysledek: 'pass-castecne', celkem: 8, pass: 7, castecne: 1, fail: 0, vadna_kriteria: [], castecna_kriteria: ['AK3 půlka v E2E'], report_path: '/sucho/projekt/docs/reviews/rez-05-p1-e2e-kolo-1.md' }
const STAV = { commit_rezu: hash('c189'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], brana_nad_head: true, strom_cisty: true, dvere: 'jednosměrné', dosah: 'data', e2e: E2E }
const beh = stav => spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => l === 'obnova-stav:řez 05' ? stav : null })

export default {
  nazev: 'obnova od uzavření podle stavu: nad čistým E2E rovnou uzavření',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved: l => l === 'obnova-stav:řez 05' ? STAV : null,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, dvere: 'jednosměrné', dosah: 'data' })
    k.rovno(volani.map(x => x.label), ['obnova-stav:řez 05', 'uzavření:řez 05'], 'volání obnovy rovnou na uzavření')
    const u = k.jeden('uzavření:řez 05')
    k.obsahuje(u, Z, 'značku obnovy v uzavření'); k.obsahuje(u, 'E2E pass-castecne 7/8', 'výsledek E2E v journalu')
    k.ok(v && v.e2e && v.e2e.vysledek === 'pass-castecne' && v.e2e.celkem === 8, `e2e: ${JSON.stringify(v && v.e2e)}`)
    const vadne = await beh({ ...STAV, e2e: { ...E2E, vadna_kriteria: ['AK7 Měna: nesplnitelné bez credentialu'] } })
    k.rovno(vadne.volani.map(x => x.label), ['obnova-stav:řez 05', 'e2e:řez 05:1', 'uzavření:řez 05'], 'vadné kritérium v E2E přerušeného běhu: obnova na E2E')
    const prostredi = await beh({ ...STAV, e2e: { ...E2E, vysledek: 'prostredi' } })
    k.rovno(prostredi.volani.map(x => x.label), ['obnova-stav:řez 05', 'e2e:řez 05:1', 'uzavření:řez 05'], 'E2E s prostředím: obnova na E2E')
    const bez = await beh({ ...STAV, e2e: undefined })
    k.rovno(bez.volani.map(x => x.label), ['obnova-stav:řez 05', 'e2e:řez 05:1', 'uzavření:řez 05'], 'bez výsledku E2E: obnova na E2E')
    k.ok(bez.vysledek && bez.vysledek.dvere === 'jednosměrné', `dveře při skoku na E2E: ${JSON.stringify(bez.vysledek && bez.vysledek.dvere)}`)
    return k.chyby
  },
}
