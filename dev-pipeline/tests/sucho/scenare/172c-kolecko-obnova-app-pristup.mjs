// 172c · kolečko · 1.9.0 (§ 1.3, plan-check N1): obnova.app_pristup a obnova.rozhodnuti_majitele platí v kolečku od fáze od_faze dál
// (deploy a E2E nesou nové pokyny, rámec od deploye nové rozhodnutí), fáze před ní mají prompty shodné s původním během (z cache);
// bez_cache kolečko přijme a ignoruje s logem.
import { argsKolecko, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { app_pristup: 'PRISTUP-PUVODNI-172c', rozhodnuti_majitele: ['ROZH-PUVODNI-172c'] }
const Z = 'ZNACKA-172c'

export default {
  nazev: 'kolečko: obnova s novými pokyny k prostředí od deploye',
  blok: 'blok-kolecko',
  args: argsKolecko(ARGS),
  odpoved: () => null,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const obnova = await spust({ blok: 'blok-kolecko', args: argsKolecko({ ...ARGS, obnova: { od_faze: 'deploy', znacka: Z, bez_cache: true, app_pristup: 'PRISTUP-NOVY-172c', rozhodnuti_majitele: ['ROZH-NOVE-172c'] } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.ok === true, `obnova: ${JSON.stringify(obnova.vysledek && obnova.vysledek.ok)}`)
    const zCache = obnova.volani.filter(x => x.z_cache), zive = obnova.volani.filter(x => !x.z_cache)
    k.ok(zCache.length > 0 && zCache.every(x => !/^(deploy|e2e|závěr):/.test(x.label)), `z cache jen fáze před deployem (${zCache.map(x => x.label).join(', ')})`)
    k.ok(zive.length > 0 && zive.every(x => /^(deploy|e2e|e2e-scénáře|verify|commit|fix-brana|závěr):/.test(x.label)), `živě jen brána, deploy, E2E a závěr (${zive.map(x => x.label).join(', ')})`)
    for (const x of zCache) { k.obsahuje(x, 'ROZH-PUVODNI-172c', 'původní rozhodnutí před deployem'); k.neobsahuje(x, '172c-NOVY', 'nové pokyny před deployem') }
    for (const x of zive.filter(y => /^(deploy|e2e|závěr):/.test(y.label))) { k.obsahuje(x, 'ROZH-NOVE-172c', 'nové rozhodnutí v rámci od deploye'); k.neobsahuje(x, 'ROZH-PUVODNI-172c', 'původní rozhodnutí po hranici') }
    for (const x of zive.filter(y => /^(deploy|e2e):/.test(y.label))) { k.obsahuje(x, 'PRISTUP-NOVY-172c', 'nové pokyny k prostředí'); k.neobsahuje(x, 'PRISTUP-PUVODNI-172c', 'původní pokyny') }
    k.ok(obnova.logy.some(l => /obnova: bez_cache kolečko ignoruje/.test(l)), 'log o ignorovaném bez_cache')
    k.ok(obnova.logy.some(l => /obnova: od fáze deploy platí pokyny k prostředí a rozhodnutí majitele z obnovy/.test(l)), 'log o přepnutí')
    return k.chyby
  },
}
