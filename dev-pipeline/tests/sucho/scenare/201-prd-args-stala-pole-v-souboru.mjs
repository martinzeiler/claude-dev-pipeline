// 201 · PRD · 1.10.0 (spec H1): stálá pole běhu (mapa_vize, vize) vkládá do souboru bloku args-bloku.py a _pole jsou klíče
// sloučeného souboru. Blok čte jedním agentem jen soubor řezu, .run-args.json nečte (běh zaklad-dat, PRD 09 a 12: agent, který
// slučoval dva soubory, vynechal mapa_vize). Agent napoprvé mapa_vize vynechá, druhé načtení ji opíše a dojde architektovi.
import { argsPrd, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const MAPA = 'MAPA-VIZE-201: Proč 1–20 · Cíle 21–60'
const SOUBOR = { ...argsPrd({ rez: '05', mapa_vize: MAPA }) }
const POLE = Object.keys(SOUBOR).sort()

export default {
  nazev: 'PRD: stálá pole v souboru řezu, jeden načítací agent',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label === 'args:řez 05') { if (stav.pocty[label] === 1) { const { mapa_vize, ...bez } = SOUBOR; return { ...bez, _pole: POLE } } return { ...SOUBOR, _pole: POLE } }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rez: '05' })
    const a = k.pocet(/^args:/, 2, 'jen soubor řezu, dvakrát')
    k.obsahuje(a[1], 'Minule chybělo: mapa_vize', 'druhé načtení jmenuje chybějící pole')
    for (const x of a) k.neobsahuje(x, '.run-args.json', 'druhý soubor v zadání načtení')
    k.obsahuje(k.jeden('prd:řez 05'), MAPA, 'mapa vize ze souboru řezu')
    return k.chyby
  },
}
