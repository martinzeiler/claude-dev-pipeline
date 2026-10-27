// 153 · stavba · 1.8.0 (spec § 2.3), od 1.9.0 (§ 1.1) s emulací cache: runtime Workflow vrací při resumeFromRunId jen nejdelší nezměněný
// prefix volání agent(). Obnova po zastavení deploy-infra v pokusu 1 (řez s částmi, kód hotový a commitnutý) s pokus 1 a od_faze deploy
// proto nesmí před deployem nic nového volat: kontrakt, části, integrace, review i brána se vrátí z cache (shodné labely a prompty
// v tomtéž pořadí), obnova-stav běží až jako první živé volání těsně před deployem a deploy dostane původní zadání plus větu obnovy.
// Dřív blok volal obnova-stav hned po args a prefix zlomil: v ostrém běhu šla celá stavba znovu nad hotovým stromem.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-153'
const ARGS = { casti: casti([['K1'], ['K2', ['K1']]]), kontrakt_potreba: true }
const PRED_DEPLOYEM = /^(implement|review|thermo|verify):/

export default {
  nazev: 'obnova po deploy-infra: fáze před deployem z cache, obnova-stav až před deployem',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'wrangler: přihlášení vypršelo' })
    return null
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', pokusy: 1 })
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo' && obnova.vysledek.pokusy === 1, `obnova: ${JSON.stringify(obnova.vysledek && [obnova.vysledek.vysledek, obnova.vysledek.pokusy])}`)
    const zCache = obnova.volani.filter(x => x.z_cache), zive = obnova.volani.filter(x => !x.z_cache)
    k.rovno(zCache.map(x => x.label), volani.filter(x => PRED_DEPLOYEM.test(x.label)).map(x => x.label), 'volání z cache = všechny fáze před deployem původního běhu')
    k.rovno(zive.map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'živá volání obnovy')
    k.ok(zive[0] && zive[0].label === 'obnova-stav:řez 05', 'první živé volání je obnova-stav (těsně před deployem)')
    k.ok(!obnova.volani.some(x => !x.z_cache && PRED_DEPLOYEM.test(x.label)), 'implementace, review ani brána neběží živě')
    const d0 = volani.find(x => x.label === 'deploy:řez 05:1'), d1 = obnova.volani.find(x => x.label === 'deploy:řez 05:1')
    k.ok(d0 && d1 && d1.prompt.startsWith(d0.prompt) && d1.prompt.includes(Z), 'deploy obnovy = původní zadání + věta obnovy se značkou')
    k.ok(obnova.logy.some(l => /obnova: fáze před deploy \(pokusy 1–1\) se mají vrátit z cache Workflow; obnova-stav běží až před fází deploy pokusu 1/.test(l)), 'log obnovy o cache')
    k.ok(!logy.some(l => /obnova/.test(l)), 'původní běh bez logu obnovy')
    return k.chyby
  },
}
