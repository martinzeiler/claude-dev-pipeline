// 172 · stavba · 1.9.0 (§ 1.3): obnova.app_pristup a obnova.rozhodnuti_majitele platí jen v promptech fází od od_faze dál. Fáze před
// deployem mají prompty shodné s původním během (rámec s původním rozhodnutím majitele) a vrátí se z cache; deploy a E2E nesou nové
// pokyny k prostředí, rámec deploye, E2E a uzavření nové rozhodnutí. Orchestrátor tak nemění args ani jejich soubor.
import { argsStavby, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-172'
const ARGS = { app_pristup: 'PRISTUP-PUVODNI-172', rozhodnuti_majitele: ['ROZH-PUVODNI-172'] }

export default {
  nazev: 'obnova s novými pokyny k prostředí: jen fáze od od_faze',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'token vypršel' })
    return null
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra' })
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, obnova: { od_faze: 'deploy', znacka: Z, pokus: 1, app_pristup: 'PRISTUP-NOVY-172', rozhodnuti_majitele: ['ROZH-NOVE-172'] } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo', `obnova: ${JSON.stringify(obnova.vysledek && obnova.vysledek.vysledek)}`)
    const zive = obnova.volani.filter(x => !x.z_cache)
    k.rovno(zive.map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'živá volání obnovy')
    for (const x of obnova.volani.filter(y => y.z_cache)) { k.obsahuje(x, 'ROZH-PUVODNI-172', 'původní rozhodnutí v rámci fáze před deployem'); k.neobsahuje(x, 'NOVY-172', 'nové pokyny ve fázi před deployem'); k.neobsahuje(x, 'NOVE-172', 'nové rozhodnutí ve fázi před deployem') }
    for (const x of zive) { k.obsahuje(x, 'ROZH-NOVE-172', 'nové rozhodnutí majitele v rámci'); k.neobsahuje(x, 'ROZH-PUVODNI-172', 'původní rozhodnutí po hranici obnovy') }
    for (const l of ['deploy:řez 05:1', 'e2e:řez 05:1']) { const x = zive.find(y => y.label === l); k.obsahuje(x, 'PRISTUP-NOVY-172', 'nové pokyny k prostředí'); k.neobsahuje(x, 'PRISTUP-PUVODNI-172', 'původní pokyny k prostředí') }
    k.ok(obnova.logy.some(l => /obnova: od fáze deploy platí pokyny k prostředí a rozhodnutí majitele z obnovy/.test(l)), 'log o přepnutí pokynů na hranici obnovy')
    return k.chyby
  },
}
