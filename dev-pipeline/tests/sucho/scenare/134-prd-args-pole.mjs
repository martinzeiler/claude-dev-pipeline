// 134 · PRD · 1.7.0 kontrola opisu args (spec 1.7.0 § 1.4): soubor nese _pole (klíče souboru a .run-args.json bez prázdných hodnot).
// Opis, který sedí, projde jedním načtením; _pole do args nejde. Pole z .run-args.json, které schéma bloku nemá (deploy_mode), se
// nepočítá jako chybějící, a prázdná hodnota (mapa_vize: "" z .run-args.json, skript ji do _pole nedá) jako navíc. rozhodnuti_majitele jde do rámce agentů bloku. V běhu sonnet-5-5 načítací agent ztratil kontrakt_rez
// a vymyslel rezim „config“.
import { argsPrd, kontrola, rozhrani, CWD, PLUGIN } from '../stuby.mjs'

const ROZH = ['2026-10-06 12:50 Bez čekání: kritéria nad časem měř ručními běhy podle Povolení']
export const ARGS_134 = { ...argsPrd({ rez: '05', kontrakt_rez: '04', rozhodnuti_majitele: ROZH }) }
export const POLE_134 = [...Object.keys(ARGS_134), 'deploy_mode'].sort()

export default {
  nazev: 'PRD: opis args sedí s _pole',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...ARGS_134, mapa_vize: '', _pole: POLE_134 }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rez: '05', kontrakt_rez: '04' })
    const n = k.pocet(/^args:/, 1, 'jedno načtení args')[0]
    k.obsahuje(n, 'pole _pole opiš přesně', 'pokyn opsat _pole'); k.obsahuje(n, 'hodnotu nikdy nepřesouvej do jiného pole')
    k.pole(n, ['_pole', 'rozhodnuti_majitele'], 'načítacího agenta')
    k.ok(logy.some(l => /opis sedí s _pole/.test(l)), 'log kontroly opisu')
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, `Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${ROZH[0]}`, 'rozhodnutí majitele v rámci')
    k.neobsahuje(ar, '_pole', '_pole v zadání agenta')
    rozhrani(k, volani.filter(x => !x.label.startsWith('args:')))
    return k.chyby
  },
}
