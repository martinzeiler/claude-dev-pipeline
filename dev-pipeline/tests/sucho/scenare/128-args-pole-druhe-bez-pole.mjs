// 128 · stavba · revize 1.7.0 (code-review N1, plan-check 7): druhé načtení args se porovná se _pole z prvního. Návrat bez _pole
// rozdíl dřív tiše propustil a blok s chybějícími hypotézami doběhl jako hotovo; teď je to ok: false a nic se nespustí.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const POLE = ['cwd', 'e2e_path', 'hypotezy', 'kriteria', 'plugin_root', 'prd_path', 'rez', 'runbook', 'runtime_dopad', 'vize', 'deploy_mode']

export default {
  nazev: 'druhé načtení bez _pole s chybějícím polem = ok: false',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label !== 'args:řez 05') return null
    stav.data.n = (stav.data.n || 0) + 1
    // Hypotézy chybí v obou načteních; prázdný objekt se bere jako chybějící pole.
    return stav.data.n === 1 ? { ...argsStavby(), rez: '05', _pole: POLE } : { ...argsStavby(), rez: '05', hypotezy: {} }
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(v && /opis nesedí/.test(v.duvod || '') && /hypotezy/.test(v.duvod), `duvod: ${v && v.duvod}`)
    const a = k.pocet(/^args:řez 05$/, 2, 'načtení a jedno nové načtení')
    if (a.length === 2) k.ok(!/Vrať přesně pole ze seznamu _pole/.test(a[1].prompt || ''), 'druhé načtení nenavádí vypustit stálá pole')
    k.nic(/^(implement|prd-refresh|review|verify|deploy)/, 'blok po nesedícím opisu nic nespouští')
    return k.chyby
  },
}
