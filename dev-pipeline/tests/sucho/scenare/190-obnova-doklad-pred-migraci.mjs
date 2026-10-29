// 190 · stavba · 1.10.0 (review N3, plan-check N3): doklad před migrací z přerušeného běhu platí i po obnově, která pokus přehrává živě
// (obnova podle stavu bez dokladu brány): brána nový doklad nepořizuje a deploy dostane původní cestu. Obnova bez_cache přeskakuje jen
// nad doloženým nasazením commitu řezu (jako 1.9.0), zelená brána nad stromem jí nestačí.
import { argsStavby, casti, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const DOKLAD = '/sucho/projekt/docs/e2e/rez-05-doklad-pred.md'
const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, doklad_pred: true }

export default {
  nazev: 'obnova: doklad před migrací se nepořizuje znovu; bez_cache bez volnějšího dokladu',
  blok: 'blok-stavby',
  args: argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: 'Z190', pokus: 1 } }),
  odpoved: l => l === 'obnova-stav:řez 05' ? { commit_rezu: '', head_shodny: false, nasazeni_dolozeno: false, provedene_kroky: [], brana_nad_head: false, strom_cisty: false, doklad_pred: DOKLAD } : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^doklad:/, 'nový doklad před migrací po obnově')
    k.obsahuje(k.jeden('deploy:řez 05:1'), DOKLAD, 'deploy s dokladem z přerušeného běhu')
    k.ok(logy.some(l => /doklad před migrací z přerušeného běhu platí/.test(l)), 'log dokladu')
    const bc = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: 'Z190b', pokus: 1, bez_cache: true } }), odpoved: l => l === 'obnova-stav:řez 05' ? { commit_rezu: '', head_shodny: false, nasazeni_dolozeno: false, provedene_kroky: [], brana_nad_head: true, strom_cisty: true } : null })
    k.ok(bc.volani.some(x => /^verify:/.test(x.label)) && bc.volani.some(x => /^implement:/.test(x.label)), 'bez_cache se zelenou bránou bez nasazení nic nepřeskakuje')
    return k.chyby
  },
}
