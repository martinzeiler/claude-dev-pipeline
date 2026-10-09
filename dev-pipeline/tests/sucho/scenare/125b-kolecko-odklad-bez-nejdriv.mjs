// 125b · kolečko · revize 1.7.0 (plan-check 6, code-review N6): odklad kolečka bez nejdriv zastaví jako deploy-infra s otázkou,
// ne jako deploy-odklad, na který by orchestrátor neměl kdy naplánovat obnovu.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'kolečko: odklad bez nejdriv = infra',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: label => label === 'deploy:kolečko:1' ? stub(label, { stav: 'odlozeno', nejdriv: '', duvod: 'okno' }) : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, faze: 'deploy-infra', infra: true, review_passed: false })
    k.ok(v && /odklad bez platného nejdriv \(prázdné\): okno/.test(v.detail || ''), `detail: ${v && v.detail}`)
    k.nic(/^(e2e|e2e-scénáře|závěr):kolečko/, 'po zastavení nic dalšího')
    return k.chyby
  },
}
