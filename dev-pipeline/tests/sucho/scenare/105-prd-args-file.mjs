// 105 · PRD · 1.6.0 args ze souboru (spec 1.6.0 § 1.3): načítací agent vrátí sloučení souboru řezu a .run-args.json, blok
// proběhne jako s plnými args a pole volání (cwd, plugin_root, rez) mají přednost. Pole chyba od načítacího agenta = ok: false
// (scénář s chybou je v over jen jako kontrola, že první varianta chybu nehlásí).
import { argsPrd, kontrola, rozhrani, CWD, PLUGIN } from '../stuby.mjs'

const MAPA_VIZE = 'MAPA-VIZE-105: 1-20 ## Proč'
const APP = 'APP-PRISTUP-105: přihlášení přes runbook'

export default {
  nazev: 'PRD: args_file se správným řezem',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: `${CWD}/docs/.prd-05.json` },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsPrd({ rez: '05', cwd: '/jiny/cwd', mapa_vize: MAPA_VIZE, app_pristup: APP }) }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rez: '05' })
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, MAPA_VIZE, 'mapu vize ze souboru'); k.obsahuje(ar, APP, 'pokyny majitele ze souboru')
    k.obsahuje(ar, `Projekt: ${CWD}`, 'cwd z volání (má přednost před souborem)')
    k.jeden('prd-check:řez 05:1')
    rozhrani(k, volani.filter(x => !x.label.startsWith('args:')))
    return k.chyby
  },
}
