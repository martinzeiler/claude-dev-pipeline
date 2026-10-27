// 172b · stavba a kolečko · 1.9.0 (plan-check N3): obnova.app_pristup přichází jen ve volání (args-bloku.py ho nevidí); nad 1 500 znaků
// blok nic nespustí a vrátí ok: false s touž hláškou jako skript.
import { argsStavby, argsKolecko, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const DLOUHE = 'pokyn '.repeat(260)
const HLASKA = /obnova\.app_pristup nad 1 500 znaků: nasazovací pokyny patří do runbooku projektu, args nesou jen odkaz a tajemství prostředí/

export default {
  nazev: 'obnova.app_pristup nad 1 500 znaků: ok: false (stavba i kolečko)',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z172b', pokus: 1, app_pristup: DLOUHE } }),
  odpoved: () => null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(v && HLASKA.test(v.duvod || ''), `návrat.duvod: ${v && v.duvod}`)
    k.ok(!volani.length, 'žádné volání agenta')
    k.ok(logy.some(l => HLASKA.test(l)), 'log')
    const kol = await spust({ blok: 'blok-kolecko', args: argsKolecko({ obnova: { od_faze: 'deploy', znacka: 'Z172b', app_pristup: DLOUHE } }), odpoved: () => null })
    k.ok(kol.vysledek && kol.vysledek.ok === false && HLASKA.test(kol.vysledek.duvod || ''), `kolečko: ${JSON.stringify(kol.vysledek)}`)
    k.ok(!kol.volani.length, 'kolečko: žádné volání agenta')
    return k.chyby
  },
}
