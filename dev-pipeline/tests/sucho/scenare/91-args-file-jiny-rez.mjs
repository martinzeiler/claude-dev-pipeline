// 91 · stavba · 1.6.0 (spec § 1.3): args ze souboru, který patří jinému řezu, blok odmítne dřív, než cokoli spustí (běh web-rijen:
// ručně přepsané args stavby 8 nesly mapu kostry řezu 7). Načítací agent je dev-pipeline:nacteni-args na sonnet/low.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'args_file jiného řezu',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '07' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, duvod: 'args_file patří řezu 07' })
    k.pocet(/./, 1, 'jen načítací agent')
    const a = k.jeden('args:řez 05')
    k.agent(a, 'dev-pipeline:nacteni-args', 'sonnet', 'low')
    k.obsahuje(a, `${CWD}/docs/.stavba-05.json`, 'cestu souboru args')
    // Od 1.10.0 (spec H1) vkládá stálá pole do souboru bloku args-bloku.py: agent čte jen soubor bloku.
    k.neobsahuje(a, '.run-args.json', 'druhý soubor (stálá pole jsou v souboru bloku)')
    k.ok(a && /^Řez 05:/.test(a.prompt), 'zadání načítacího agenta začíná „Řez 05:“ (hlídač)')
    return k.chyby
  },
}
