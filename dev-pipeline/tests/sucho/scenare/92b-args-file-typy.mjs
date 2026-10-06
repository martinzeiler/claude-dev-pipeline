// 92b · stavba · 1.6.0 (review 1.6.0 N12): schéma načtení args má typy a blok po načtení normalizuje řetězce. Řetězec „false“
// u runtime_dopad nesmí přepnout řez bez runtime dopadu na nasazení a E2E v prohlížeči, „false“ u doklad_pred nevyžaduje doklad.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'args_file: typy a normalizace pravdivostních hodnot',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: '05', args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', runtime_dopad: 'false', doklad_pred: 'false', kriteria: '8', max_pokusu: '1' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const a = k.jeden('args:řez 05')
    k.ok(a && a.schema.properties.runtime_dopad.type === 'boolean' && a.schema.properties.kriteria.type === 'integer', `typy ve schématu: ${JSON.stringify(a && a.schema.properties.runtime_dopad)}`)
    k.jeden('kriteria:řez 05:1'); k.nic(/^e2e:/, 'řez bez runtime dopadu v prohlížeči')
    k.nic(/^doklad:/, 'doklad z řetězce „false“')
    k.obsahuje(k.jeden('implement:řez 05:1'), 'Pokus 1 z 1', 'max_pokusu z řetězce „1“')
    return k.chyby
  },
}
