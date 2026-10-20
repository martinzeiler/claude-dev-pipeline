// 153 · stavba · 1.8.0 (spec § 2.3, review N1): obnova po zastavení deploy-infra v pokusu 1 (řez s částmi, kód hotový a commitnutý).
// Obnova s pokus 1 a od_faze deploy musí dát fázím před deployem přesně stejné labely a prompty jako původní běh (z resumeFromRunId
// cache se vrátí), takže kontrakt, části, integrace, review ani brána se neopakují; deploy dostane původní zadání plus větu obnovy.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-153'
const ARGS = { casti: casti([['K1'], ['K2', ['K1']]]), kontrakt_potreba: true }
const PRED_DEPLOYEM = /^(implement|review|thermo|verify):/

export default {
  nazev: 'obnova po deploy-infra: fáze před deployem shodné s původním během',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'wrangler: přihlášení vypršelo' })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', pokusy: 1 })
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } }), odpoved: () => null })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo' && obnova.vysledek.pokusy === 1, `obnova: ${JSON.stringify(obnova.vysledek && [obnova.vysledek.vysledek, obnova.vysledek.pokusy])}`)
    k.ok(obnova.volani[0] && obnova.volani[0].label === 'obnova-stav:řez 05', 'obnova začíná stavem obnovy')
    const puvodni = volani.filter(x => PRED_DEPLOYEM.test(x.label)), obnovene = obnova.volani.filter(x => PRED_DEPLOYEM.test(x.label))
    k.rovno(obnovene.map(x => x.label), puvodni.map(x => x.label), 'labely fází před deployem')
    for (const x of obnovene) {
      const p = puvodni.find(y => y.label === x.label)
      if (p && p.prompt !== x.prompt) k.chyby.push(`${x.label}: prompt obnovy se liší od původního běhu (cache by minula)`)
    }
    const d0 = volani.find(x => x.label === 'deploy:řez 05:1'), d1 = obnova.volani.find(x => x.label === 'deploy:řez 05:1')
    k.ok(d0 && d1 && d1.prompt.startsWith(d0.prompt) && d1.prompt.includes(Z), 'deploy obnovy = původní zadání + věta obnovy se značkou')
    return k.chyby
  },
}
