// 215 · stavba · 1.11.0 (spec B5; řez 19a jinak vypadal jako bez review): zastavení nese review, thermo a části v návratu i v souboru
// docs/.vysledek-stavba-NN-zastaveno.json a obnova, která fáze přeskočí, je převezme přes obnova-stav.
import { argsStavby, casti, kontrola, stub, hash } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }

export default {
  nazev: 'zastavení nese revizi, obnova ji převezme',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'token vypršel' })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra' })
    k.ok(v && v.review && v.review.kola === 1, `review v návratu: ${JSON.stringify(v && v.review)}`)
    k.ok(v && v.thermo && v.thermo.nalezu === 0, `thermo v návratu: ${JSON.stringify(v && v.thermo)}`)
    const u = k.jeden('uzavření:řez 05:zastaveno')
    k.obsahuje(u, '"review":{"kola":1', 'review v souboru'); k.obsahuje(u, '"thermo":{"nalezu":0', 'thermo v souboru'); k.obsahuje(u, '"casti":[{"id":"K1","hotovo":true,"zrevidovano":true}', 'části v souboru')
    const STAV = { commit_rezu: hash('r215'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], brana_nad_head: false, strom_cisty: true,
      review: { kola: 2, nalezu: 5, blokujicich: 1, fix_agentu: 3 }, thermo: { nalezu: 2, blokeru: 0, oprava: 've vlně review' }, casti: [{ id: 'K1', hotovo: true }, { id: 'K2', hotovo: true }] }
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, obnova: { od_faze: 'e2e', znacka: 'Z215', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? STAV : null })
    const o = kontrola(obnova.volani)
    o.rovno(obnova.volani.map(x => x.label), ['obnova-stav:řez 05', 'e2e:řez 05:1', 'uzavření:řez 05'], 'obnova bez review')
    const r = obnova.vysledek
    o.ok(r && r.review && r.review.kola === 2 && r.review.nalezu === 5 && r.review.fix_agentu === 3, `převzaté review: ${JSON.stringify(r && r.review)}`)
    o.ok(r && r.thermo && r.thermo.nalezu === 2, `převzaté thermo: ${JSON.stringify(r && r.thermo)}`)
    o.rovno(r && r.casti, [{ id: 'K1', hotovo: true }, { id: 'K2', hotovo: true }], 'převzaté části')
    k.chyby.push(...o.chyby.map(x => `obnova: ${x}`))
    return k.chyby
  },
}
