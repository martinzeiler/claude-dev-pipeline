// 212 · stavba · 1.11.0 (spec B2): po obnově nad přeskočenou bránou chybí posledniBrana, ale strom se nezměnil: další pokus jen dorovná deploy.
// Log „další pokus jen dorovná deploy“ se vypíše jen tehdy, když se to opravdu stane.
import { argsStavby, kontrola, stub, hash } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const CHYBA = id => ({ kroky_po_nasazeni: [{ id, krok: 'seed', stav: 'selhalo', duvod: 'timeout' }] })
const STAV = { commit_rezu: hash('r212'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [] }
const ARGS = { obnova: { od_faze: 'deploy', znacka: 'Z212', pokus: 1, bez_cache: true } }

export default {
  nazev: 'dorovnání po obnově bez poslední brány',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'obnova-stav:řez 05') return STAV
    if (label === 'deploy:řez 05:1') return stub(label, CHYBA(1))
    return null
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^(implement|verify|review|thermo):/, 'dorovnání po obnově bez implementace, review a brány')
    k.obsahuje(k.jeden('deploy:řez 05:p2:1'), 'Dorovnání: minulý pokus selhal jen na krocích po nasazení', 'dorovnání v zadání')
    k.ok(logy.some(l => /pokus 1 selhal ve fázi deploy \(krok po nasazení: další pokus jen dorovná deploy\)/.test(l)), 'log dorovnání')
    const dvakrat = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => l === 'obnova-stav:řez 05' ? STAV : /^deploy:řez 05:(p2:)?1$/.test(l) ? stub(l, CHYBA(1)) : null })
    k.ok(dvakrat.logy.some(l => /^pokus 2 selhal ve fázi deploy$/.test(l)), `po neúspěšném dorovnání log bez věty o dorovnání: ${dvakrat.logy.filter(l => /pokus 2 selhal/.test(l)).join(' | ')}`)
    return k.chyby
  },
}
