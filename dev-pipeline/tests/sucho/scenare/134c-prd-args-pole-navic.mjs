// 134c · PRD · 1.7.0 kontrola opisu args (spec 1.7.0 § 1.4): načítací agent dvakrát vrátí pole, které soubor nemá (rezim „config“
// z deploy_mode, běh sonnet-5-5 PRD 06). Blok skončí ok: false s výpisem rozdílu a nic dalšího nespustí.
import { kontrola, CWD, PLUGIN, S } from '../stuby.mjs'
import { ARGS_134, POLE_134 } from './134-prd-args-pole.mjs'

export default {
  nazev: 'PRD: pole navíc v opisu args, blok skončí',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...ARGS_134, rezim: 'config', _pole: POLE_134 }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/args_file: opis nesedí \(chybí: –; navíc: rezim\)/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.pocet(/./, 2, 'jen dvě načtení args')
    return k.chyby
  },
}
