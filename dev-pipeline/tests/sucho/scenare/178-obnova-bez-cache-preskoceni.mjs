// 178 · stavba · 1.9.0 (§ 1.2): obnova.bez_cache: true od deploye v pokusu 2: blok začne rovnou pokusem 2 (pokus 1 se živě nepřehrává),
// obnova-stav běží hned jako první volání a nad doloženým nasazením implementaci, review a bránu pokusu 2 přeskočí.
import { argsStavby, kontrola, hash } from '../stuby.mjs'

const Z = 'ZNACKA-178'

export default {
  nazev: 'obnova bez cache od pokusu 2: žádný pokus 1, přeskočení nad doloženým nasazením',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: Z, pokus: 2, bez_cache: true } }),
  odpoved(label) {
    if (label === 'obnova-stav:řez 05') return { commit_rezu: hash('c178'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.ok(volani[0] && volani[0].label === 'obnova-stav:řez 05', `první volání má být obnova-stav, je ${volani[0] && volani[0].label}`)
    k.nic(/^(implement|review|thermo|verify|diagnose):/, 'pokus 1 ani stavba pokusu 2')
    k.pocet(/^deploy:/, 1, 'jeden deploy (pokus 2)')
    // Štítky pokusu 2 nesou od 1.10.0 :p2.
    k.obsahuje(k.jeden('e2e:řez 05:p2:1'), 'rez-05-p2-e2e', 'report pokusu 2'); k.obsahuje(k.jeden('deploy:řez 05:p2:1'), Z, 'značku obnovy')
    k.ok(logy.some(l => l.includes('obnova bez cache (bez_cache): blok začíná pokusem 2, pokusy 1–1 se nepřehrávají')), 'log začátku pokusem 2')
    return k.chyby
  },
}
