// 134b · PRD · 1.7.0 kontrola opisu args (spec 1.7.0 § 1.4): první opis ztratí kontrakt_rez (běh sonnet-5-5, PRD 03), blok načte
// znovu se zadáním „minule chybělo“ a druhý, správný opis projde.
import { kontrola, CWD, PLUGIN } from '../stuby.mjs'
import { ARGS_134, POLE_134 } from './134-prd-args-pole.mjs'

export default {
  nazev: 'PRD: chybějící pole v opisu args, nové načtení',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label === 'args:řez 05') {
      if (stav.pocty[label] === 1) { const { kontrakt_rez, ...bez } = ARGS_134; return { ...bez, _pole: POLE_134 } }
      return { ...ARGS_134, _pole: POLE_134 }
    }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, kontrakt_rez: '04' })
    const n = k.pocet(/^args:/, 2, 'dvě načtení args')
    k.obsahuje(n[1], 'Minule chybělo: kontrakt_rez, navíc bylo: nic', 'druhé načtení jmenuje rozdíl')
    k.jeden('prd:řez 05')
    return k.chyby
  },
}
