// 186 · stavba · 1.10.0 (spec H1; třída N3): args čte jeden agent jen ze souboru bloku. Stálá pole z docs/.run-args.json do souboru vkládá
// args-bloku.py a _pole jsou klíče sloučeného souboru: v běhu zaklad-dat agent, který slučoval dva soubory, dvakrát vynechal mapa_vize.
// Chybějící stálé pole (tady deploy_okno) načte týž agent znovu se zadáním, co chybělo; stálé pole dojde do zadání deploye.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const POLE = ['cwd', 'deploy_mode', 'deploy_okno', 'e2e_path', 'kriteria', 'plugin_root', 'prd_path', 'rez', 'runbook', 'runtime_dopad', 'vize']

export default {
  nazev: 'jeden načítací agent: chybějící stálé pole načte znovu',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label, p, o, stav) {
    if (label !== 'args:řez 05') return null
    stav.data.n = (stav.data.n || 0) + 1
    return stav.data.n === 1 ? { ...argsStavby(), rez: '05', _pole: POLE } : { ...argsStavby(), rez: '05', _pole: POLE, deploy_okno: 'OKNO-186 22:00–06:00' }
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const a = k.pocet(/^args:/, 2, 'načtení a jedno nové načtení, žádný druhý soubor')
    if (a.length === 2) { k.obsahuje(a[1], 'minule chybělo: deploy_okno', 'co chybělo'); k.neobsahuje(a[0], '.run-args.json', 'druhý soubor') }
    k.obsahuje(k.jeden('deploy:řez 05:1'), 'OKNO-186', 'stálé pole ze souboru bloku v deployi')
    return k.chyby
  },
}
