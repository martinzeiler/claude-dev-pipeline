// 104 · PRD · 1.6.0 args ze souboru s cizím řezem (spec 1.6.0 § 1.3): načítací agent vrátí args řezu 07, volání je pro řez 05.
// Blok nic dalšího nespustí a vrátí ok: false s důvodem. Stavba 8 běhu web-rijen dostala mapu kostry řezu 7 a nikdo to nepoznal.
import { argsPrd, kontrola, CWD, PLUGIN, S } from '../stuby.mjs'

export default {
  nazev: 'PRD: args_file patří jinému řezu',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsPrd({ rez: '07' }) }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/patří řezu 07/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.pocet(/./, 1, 'jen načtení args')
    const n = k.jeden('args:řez 05')
    k.agent(n, 'dev-pipeline:nacteni-args', 'sonnet', 'low')
    k.obsahuje(n, `${CWD}/docs/.prd-05.json`, 'absolutní cestu k args_file'); k.obsahuje(n, `${CWD}/docs/.run-args.json`, 'stálé args běhu')
    k.ok(n && n.prompt.startsWith('Řez 05:'), 'zadání načtení začíná „Řez 05:“ (hlídač kontextu)')
    return k.chyby
  },
}
