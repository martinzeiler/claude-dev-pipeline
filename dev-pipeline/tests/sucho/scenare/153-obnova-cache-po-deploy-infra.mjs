// 153 · stavba · 1.10.0 (spec F1, třída N5): obnova po zastavení deploy-infra u řezu s částmi jde podle stavu, ne podle cache. Cache vrací
// jen nezměněný prefix volání a v ostrém běhu (zaklad-dat, řez 13) ji zlomili nástupci částí, kteří se při přehrání volali v jiném
// pořadí: 37 agentů znovu, $39. obnova-stav je první volání obnovy; zelená brána nad dnešním pracovním stromem (commit k tomu potřeba
// není) přeskočí kontrakt, části, integraci, review i bránu a deploy dostane větu obnovy. Bez dokladu běží přerušený pokus celý (bez cache).
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-153'
const ARGS = { casti: casti([['K1'], ['K2', ['K1']]]), kontrakt_potreba: true }
const PRED_DEPLOYEM = /^(implement|review|thermo|verify|prd-refresh):/
const DOLOZENO = { commit_rezu: '', head_shodny: false, nasazeni_dolozeno: false, provedene_kroky: [], commit_pokusu: '', brana_nad_head: true, strom_cisty: false }

export default {
  nazev: 'obnova po deploy-infra podle stavu: s doloženou bránou rovnou deploy',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, infra_trida: 'clovek', duvod: 'wrangler: přihlášení vypršelo' })
    return null
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', pokusy: 1 })
    const args = argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } })
    const obnova = await spust({ blok: 'blok-stavby', args, odpoved: l => l === 'obnova-stav:řez 05' ? DOLOZENO : null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo' && obnova.vysledek.pokusy === 1, `obnova: ${JSON.stringify(obnova.vysledek && [obnova.vysledek.vysledek, obnova.vysledek.pokusy])}`)
    k.rovno(obnova.volani.map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'volání obnovy s doloženou bránou')
    const d1 = obnova.volani.find(x => x.label === 'deploy:řez 05:1')
    k.obsahuje(d1, Z, 'značku obnovy v deployi'); k.obsahuje(d1, 'může už existovat (git log --grep)', 'větu o commitu z přerušeného běhu')
    const os = obnova.volani[0]
    k.obsahuje(os, 'commit_pokusu', 'zadání obnova-stav: commit pokusu'); k.obsahuje(os, '/sucho/plugin/scripts/tree-hash.sh', 'zadání obnova-stav: hash stromu')
    k.ok(obnova.logy.some(l => /obnova od deploy podle stavu/.test(l)), 'log obnovy podle stavu')
    k.ok(obnova.logy.some(l => /brána nad dnešním stromem doložená/.test(l)), 'log doložené brány')
    k.ok(!logy.some(l => /obnova/.test(l)), 'původní běh bez logu obnovy')
    // Bez dokladu (výchozí stub obnova-stav) běží přerušený pokus celý, živě: cache se za obnova-stav nepotká.
    const bez = await spust({ blok: 'blok-stavby', args, odpoved: () => null }, { cache: volani })
    k.ok(bez.vysledek && bez.vysledek.vysledek === 'hotovo', `obnova bez dokladu: ${JSON.stringify(bez.vysledek && bez.vysledek.vysledek)}`)
    k.ok(bez.volani[0] && bez.volani[0].label === 'obnova-stav:řez 05', 'obnova bez dokladu: první volání obnova-stav')
    k.ok(bez.volani.some(x => PRED_DEPLOYEM.test(x.label)) && !bez.volani.some(x => x.z_cache), 'obnova bez dokladu: fáze před deployem běží živě, nic z cache')
    for (const x of bez.volani.filter(y => PRED_DEPLOYEM.test(y.label))) k.neobsahuje(x, Z, 'značku před deployem')
    return k.chyby
  },
}
