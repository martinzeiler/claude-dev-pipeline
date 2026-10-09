// 116 · stavba · 1.7.0 (spec § 1.4): rozhodnutí majitele z docs/.run-args.json (rozhodnuti_majitele) jde do rámce každého agenta
// bloku (běh sonnet-5-5: „bez čekání“ šlo jen v hypotézách staveb). Rychlé kontroly nad celým stromem jdou fix agentům (§ 1.13).
import { argsStavby, kontrola, stub, oprava, zelenaBrana, CWD, PLUGIN } from '../stuby.mjs'

const R = '2026-10-06 12:50 „ve vizi jsme žádné čekání neměli, ruční běhy podle P2“'
const RK = 'pnpm verify:arch && pnpm straze:literaly'

export default {
  nazev: 'rozhodnutí majitele v rámci a rychlé kontroly ve fixech',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', rozhodnuti_majitele: [R], rychle_kontroly: RK }
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 1, blokujicich: 0, report_path: `${CWD}/r.md`, balicky: [{ soubory: ['apps/a.ts'], nalezy: ['N1'] }] })
    if (label === 'fix:řez 05:1.1') return oprava({ opravene_ids: ['N1'] })
    if (label === 'verify:řez 05:1') return zelenaBrana({ selhalo: 1, exit_kod: 1, selhavajici: ['straze.test.ts'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const x of volani.filter(x => !/^args:/.test(x.label))) k.obsahuje(x, R, 'rozhodnutí majitele v rámci')
    for (const l of ['fix:řez 05:1.1', 'fix-brana:řez 05']) k.obsahuje(k.jeden(l), `rychlé kontroly nad celým stromem: ${RK}`, 'rychlé kontroly')
    return k.chyby
  },
}
