// 101b · PRD · 1.6.0 pokračování od autorů přes scripts/args-bloku.py (code-review 1.6.0, N2): orchestrátor podle šablony skillu
// pošle jen `--puvodni-run <runId> --doplnit '{"od_faze": "autori"}'`; skript vezme pole volání (plan_row, hypotezy, profil …)
// z minulého docs/.prd-NN.json a blok s args_file doběhne. Do opravy soubor nesl jen cwd, od_faze, puvodni a rez a blok skončil
// „chybí args: … plan_row“. Načítací agent je stub, který vrátí sloučení .run-args.json a souboru ze skriptu (jako agent).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kontrola, rozhrani, CWD, PLUGIN } from '../stuby.mjs'
import { PUVODNI } from './101-prd-od-faze-autori.mjs'

// PLUGIN ze stubů je jen jméno v zadáních; skript se pouští ze skutečného repa pluginu.
const SKRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/args-bloku.py')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sucho-101b-'))
const proj = path.join(tmp, 'proj')
const wfd = path.join(tmp, 'tr', '-p', 'sess-101b', 'workflows')
fs.mkdirSync(path.join(proj, 'docs'), { recursive: true })
fs.mkdirSync(wfd, { recursive: true })
const RUN_ARGS = { vize: `${CWD}/docs/vize/sucho.md`, mapa_vize: 'MAPA-101b' }
fs.writeFileSync(path.join(proj, 'docs', '.run-args.json'), JSON.stringify(RUN_ARGS))
fs.writeFileSync(path.join(wfd, 'wf_arch-101b.json'), JSON.stringify({ status: 'completed', workflowName: 'blok-prd', result: PUVODNI }))
const ab = (...argv) => execFileSync('python3', ['-I', SKRIPT, ...argv],
  { env: { ...process.env, DEV_PIPELINE_TRANSCRIPTS: path.join(tmp, 'tr') }, encoding: 'utf8' })
ab('prd', proj, '5', '--doplnit', JSON.stringify({ plan_row: { rez: 5, nazev: 'ROW-101b', body: ['C1'] }, hypotezy: ['HYP-101b'], profil: 'lehky' }))
ab('prd', proj, '5', '--puvodni-run', 'wf_arch-101b', '--doplnit', JSON.stringify({ od_faze: 'autori' }))
const SOUBOR = JSON.parse(fs.readFileSync(path.join(proj, 'docs', '.prd-05.json'), 'utf8'))
fs.rmSync(tmp, { recursive: true, force: true })

export default {
  nazev: 'PRD: od_faze autori přes args-bloku.py (pole volání ze základu)',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: `${CWD}/docs/.prd-05.json` },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...RUN_ARGS, ...SOUBOR }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.rovno([SOUBOR.plan_row && SOUBOR.plan_row.nazev, SOUBOR.hypotezy, SOUBOR.od_faze], ['ROW-101b', ['HYP-101b'], 'autori'], 'soubor ze skriptu nese pole volání i od_faze')
    k.navrat(v, { ok: true, prd_path: PUVODNI.prd_path, profil: 'lehky' })
    k.nic(/^prd:řez 05(:n\d+)?$/, 'architekt při pokračování od autorů')
    k.pocet(/^prd-část:/, 3, 'autoři částí')
    k.obsahuje(k.jeden('prd-check:řez 05:1'), 'ROW-101b', 'řádek plánu ze základu')
    k.rovno(v && v.stavba && v.stavba.profil, 'lehky', 'návrat.stavba.profil (lehký profil jde stavbě)')
    rozhrani(k, volani.filter(x => !x.label.startsWith('args:')))
    return k.chyby
  },
}
