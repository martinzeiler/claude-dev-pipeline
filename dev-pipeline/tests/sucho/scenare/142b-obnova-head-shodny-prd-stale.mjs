// 142b · stavba · 1.8.0 (spec § 2.3), od 1.9.0 s bez_cache: obnova nad nasazeným commitem se zestárlým PRD spustí jen refresh PRD, implementaci ne.
import { argsStavby, kontrola, hash } from '../stuby.mjs'

export default {
  nazev: 'obnova bez cache nad nasazeným commitem: jen refresh PRD',
  blok: 'blok-stavby',
  args: argsStavby({ prd_stale: ['řez 03: cache'], obnova: { od_faze: 'e2e', znacka: 'Z142b', pokus: 1, bez_cache: true } }),
  odpoved(label) {
    if (label === 'obnova-stav:řez 05') return { commit_rezu: hash('c'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.jeden('prd-refresh:řez 05')
    k.pred(k.jeden('obnova-stav:řez 05'), k.jeden('prd-refresh:řez 05'))
    k.nic(/^(implement|review|thermo|verify):/, 'jen refresh, bez stavby')
    return k.chyby
  },
}
