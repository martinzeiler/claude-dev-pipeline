// 188 · stavba · 1.10.0 (spec F1, review N5): obnova řezu s částmi od E2E podle stavu respektuje od_faze. Zelená brána nad dnešním stromem,
// HEAD doloženě nasazený commit řezu a čistý strom: deploy se nepouští, obnova jde rovnou na E2E (značka od E2E). Strom s necommitnutými
// změnami (nebo nedoložené nasazení) pošle obnovu na deploy. Bez dokladu brány běží přerušený pokus celý.
import { argsStavby, casti, hash, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-188'
const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, obnova: { od_faze: 'e2e', znacka: Z, pokus: 1 } }
const STAV = { commit_rezu: hash('c188'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], brana_nad_head: true, strom_cisty: true }
const beh = stav => spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => l === 'obnova-stav:řez 05' ? stav : null })

export default {
  nazev: 'obnova od E2E podle stavu: s doloženým nasazením rovnou E2E',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved: l => l === 'obnova-stav:řez 05' ? STAV : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, commit: hash('c188') })
    k.rovno(volani.map(x => x.label), ['obnova-stav:řez 05', 'e2e:řez 05:1', 'uzavření:řez 05'], 'volání obnovy rovnou na E2E')
    k.obsahuje(k.jeden('e2e:řez 05:1'), Z, 'značku obnovy v E2E'); k.obsahuje(k.jeden('e2e:řez 05:1'), hash('c188'), 'nasazený commit řezu v E2E')
    k.ok(logy.some(l => /obnova jde rovnou na E2E/.test(l)), 'log skoku na E2E')
    const spinavy = await beh({ ...STAV, strom_cisty: false })
    k.rovno(spinavy.volani.map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'necommitnutý strom: obnova od deploye')
    k.obsahuje(spinavy.volani.find(x => x.label === 'deploy:řez 05:1'), Z, 'značku obnovy v deployi')
    const bez = await beh({ ...STAV, brana_nad_head: false })
    k.ok(bez.volani.some(x => /^implement:řez 05:kontrakt:1$/.test(x.label)) && bez.volani.some(x => /^verify:/.test(x.label)), 'bez dokladu brány celý pokus')
    return k.chyby
  },
}
