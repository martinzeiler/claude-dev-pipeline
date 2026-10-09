// 118b · stavba i kolečko · revize 1.7.0 (plan-check 6, code-review N6): odklad bez platného nejdriv nemá na kdy naplánovat obnovu.
// Blok ho bere jako infra zastavení (faze deploy-infra, infra: true) s detailem „odklad bez platného nejdriv“, ne jako deploy-odklad.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'odklad bez platného nejdriv = infra zastavení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: label => label === 'deploy:řez 05:1' ? stub(label, { stav: 'odlozeno', nejdriv: 'zítra ráno', duvod: 'zakázané okno' }) : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', infra: true, pokusy: 1 })
    k.ok(v && /odklad bez platného nejdriv \(zítra ráno\): zakázané okno/.test(v.detail || '') && !v.nejdriv, `detail: ${v && v.detail}, nejdriv: ${v && v.nejdriv}`)
    k.nic(/^(e2e|implement:řez 05:2|diagnose)/, 'zastavení nespotřebuje pokus')
    return k.chyby
  },
}
