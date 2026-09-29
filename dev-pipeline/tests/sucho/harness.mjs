// Suchý běh bloků dev-pipeline: přehraje Workflow skript bloku se stubnutými agenty, bez jediného tokenu, a projde
// rozhodovací logiku včetně vzácných větví (předávka, infra selhání, obnova, části). Vzor: harness diagnózy řezu 01
// v běhu bez-dluhu, ale stuby se rozlišují podle labelu (§ 1.1 spec 1.4.0), ne podle schématu.
// Použití: node harness.mjs [--vypis] [filtr …]   filtr = podřetězec jména souboru scénáře; --vypis ukáže časovou osu volání.
// SUCHO_BLOKY=<adresář> přehraje bloky z jiného adresáře (rozpracovaná kopie).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { vychozi, NIC, S } from './stuby.mjs'

const TADY = path.dirname(fileURLToPath(import.meta.url))
export const BLOKY = process.env.SUCHO_BLOKY ? path.resolve(process.env.SUCHO_BLOKY) : path.resolve(TADY, '../../workflows')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// Strop volání a času: blok, který se zacyklí na opakování, nesmí suchý běh zablokovat.
const STROP_VOLANI = 400
const STROP_MS = 10000
const skutecnyTimeout = globalThis.setTimeout

export function nactiBlok(blok, adresar = BLOKY) {
  const src = fs.readFileSync(path.join(adresar, `${blok}.js`), 'utf8').replace(/^export const meta/m, 'const meta')
  return new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', 'setTimeout', src)
}

// Spustí blok nad args scénáře. Každé volání agenta dostane start a konec na logických hodinách; stub odpovídá
// nejdřív v dalším kole smyčky událostí, takže volání spuštěná jedním parallel() všechna začnou dřív, než kterékoli
// skončí, a sekvenční volání se nikdy nepřekryjí.
export async function spust(scenar, adresar = BLOKY) {
  const volani = [], logy = [], faze = [], nezname = []
  const stav = { args: scenar.args, volani, pocty: {}, data: {} }
  let hodiny = 0
  async function agent(prompt, opts = {}) {
    const schema = opts.schema || {}
    const z = {
      i: volani.length, label: S(opts.label), phase: opts.phase, agentType: opts.agentType, model: opts.model, effort: opts.effort,
      prompt: S(prompt), schema, klice: Object.keys(schema.properties || {}), povinne: schema.required || [], start: ++hodiny, konec: null, odpoved: null,
    }
    volani.push(z)
    if (volani.length > STROP_VOLANI) return new Promise(() => {}) // zacyklený blok: nechat vyhladovět, strop času ho ukončí
    stav.pocty[z.label] = (stav.pocty[z.label] || 0) + 1
    // Odpověď až ve skutečném dalším kole smyčky událostí: větev parallel(), která před voláním agenta ještě na něco
    // čeká (mikroúlohy), tak pořád začne dřív, než souběžný soused skončí.
    await new Promise(res => skutecnyTimeout(res, 0))
    let r = scenar.odpoved ? await scenar.odpoved(z.label, z.prompt, opts, stav) : null
    if (r == null) {
      r = vychozi(z.label, z.prompt, opts, stav)
      if (r === undefined) { nezname.push(z.label); r = NIC }
    }
    z.konec = ++hodiny
    if (r === NIC) return null
    z.odpoved = r
    // Kopie: blok smí návrat mutovat (normE2E), záznam volání má zůstat, jak ho stub vrátil.
    return structuredClone(r)
  }
  const parallel = fns => Promise.all(fns.map(f => f()))
  const okamzite = (f) => { f(); return 0 }
  let vysledek, chyba = null, casovac
  try {
    const telo = nactiBlok(scenar.blok, adresar)
    const beh = telo(scenar.args, agent, m => logy.push(S(m)), t => faze.push(S(t)), parallel, okamzite)
    const strop = new Promise((_, rej) => { casovac = skutecnyTimeout(() => rej(new Error(`blok neskončil do ${STROP_MS / 1000} s (${volani.length} volání)`)), STROP_MS) })
    vysledek = await Promise.race([beh, strop])
  } catch (e) {
    chyba = S(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)
  } finally { clearTimeout(casovac) }
  return { vysledek, volani, logy, faze, nezname, chyba }
}

export async function vyhodnot(scenar, adresar = BLOKY) {
  const b = await spust(scenar, adresar)
  const chyby = []
  if (b.chyba) chyby.push(`blok neproběhl: ${b.chyba}`)
  for (const l of [...new Set(b.nezname)]) chyby.push(`stub nezná label „${l}“ (mimo § 1.1)`)
  if (!b.chyba) {
    try { chyby.push(...(scenar.over(b.vysledek, b.volani, b.logy, b) || [])) }
    catch (e) { chyby.push(`over() spadlo (blok vrátil nečekaný tvar?): ${S(e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)}`) }
  }
  return { ...b, chyby }
}

async function nactiScenare(filtry) {
  const adr = path.join(TADY, 'scenare')
  const soubory = fs.readdirSync(adr).filter(f => f.endsWith('.mjs')).sort()
    .filter(f => !filtry.length || filtry.some(x => f.includes(x)))
  const out = []
  for (const f of soubory) {
    const m = await import(pathToFileURL(path.join(adr, f)).href)
    const sc = m.default || m
    out.push({ soubor: f, ...sc })
  }
  return out
}

function vypisOsu(b) {
  for (const v of b.volani) console.log(`      [${String(v.start).padStart(3)}–${String(v.konec ?? '∞').padEnd(3)}] ${v.label}  (${v.agentType || '?'} ${v.model || ''}/${v.effort || ''})${v.odpoved ? '' : ' → nic'}`)
  console.log(`      fáze: ${b.faze.join(' → ') || '-'}`)
  if (b.vysledek) console.log(`      výsledek: ${JSON.stringify(b.vysledek).slice(0, 400)}`)
}

async function main() {
  const argv = process.argv.slice(2)
  const vypis = argv.includes('--vypis')
  const scenare = await nactiScenare(argv.filter(x => x !== '--vypis'))
  if (!scenare.length) { console.log('suchý běh: žádný scénář'); process.exit(1) }
  console.log(`suchý běh: bloky z ${BLOKY}`)
  let prosel = 0
  for (const sc of scenare) {
    const jmeno = sc.soubor.replace(/\.mjs$/, '')
    let b
    try { b = await vyhodnot(sc) } catch (e) { b = { chyby: [`harness spadl: ${S(e && e.message || e)}`], volani: [], faze: [] } }
    const ok = !b.chyby.length
    if (ok) prosel++
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${jmeno} · ${sc.blok} · ${sc.nazev} (${b.volani.length} volání)`)
    for (const c of b.chyby) console.log(`      - ${c}`)
    if (vypis) vypisOsu(b)
  }
  console.log(`\nscénáře: ${prosel}/${scenare.length} prošlo`)
  process.exit(prosel === scenare.length ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
