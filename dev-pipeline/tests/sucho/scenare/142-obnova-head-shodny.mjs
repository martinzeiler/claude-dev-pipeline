// 142 · stavba · 1.8.0 (spec § 2.3): při obnově je první krok po args deploy v režimu obnova-stav. HEAD je commit řezu a nasazení je
// doložené: implementace, review a brána se nepouští bez ohledu na cache; provedené kroky po nasazení z přerušeného běhu dostane deploy
// a krok vynechaný s doloženým dřívějším provedením pokus nestojí.
import { argsStavby, kontrola, stub, hash } from '../stuby.mjs'

const Z = 'ZNACKA-142'

export default {
  nazev: 'obnova nad nasazeným commitem: bez implementace, review a brány',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } }),
  odpoved(label) {
    if (label === 'obnova-stav:řez 05') return { commit_rezu: hash('commit řezu 142'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [{ id: 2, krok: 'purge keše CDN' }] }
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [{ id: 2, krok: 'purge keše CDN', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.ok(volani[0] && volani[0].label === 'obnova-stav:řez 05', `první volání má být obnova-stav, je ${volani[0] && volani[0].label}`)
    k.agent(k.jeden('obnova-stav:řez 05'), 'dev-pipeline:deploy', 'sonnet', 'low')
    k.pole(k.jeden('obnova-stav:řez 05'), ['commit_rezu', 'head_shodny', 'nasazeni_dolozeno', 'provedene_kroky'], 'OBNOVA_STAV')
    k.nic(/^(implement|review|thermo|verify|fix|doklad):/, 'nad nasazeným commitem se nestaví, nereviduje a neměří brána')
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'Předchozí nasazení tohoto řezu už provedlo: 2. purge keše CDN', 'provedené kroky z přerušeného běhu')
    k.obsahuje(d, Z, 'značku obnovy'); k.obsahuje(k.jeden('e2e:řez 05:1'), Z, 'značku obnovy')
    k.ok(logy.some(l => /implementace, review a brána se nepouští/.test(l)), 'log o přeskočení fází')
    return k.chyby
  },
}
