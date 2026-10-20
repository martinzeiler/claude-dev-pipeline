// 148 · kolečko · 1.8.0 (spec § 2.6): fáze Dluh po kole 1: agent sběru vrátí balíčky položek [oprava] z follow-ups, fix agenti je opraví
// po balíčcích, brána, commit „kolecko: dluh z follow-ups“; závěr opravené přeškrtne a návrat nese počty dluhu.
import { argsKolecko, kontrola, oprava, CWD, PLUGIN } from '../stuby.mjs'

const D1 = '[řez 03 · admin] [oprava] apps/a.ts: chybí validace vstupu DLUH-148-1'
const D3 = '[řez 02 · web] [oprava] apps/b.ts: mrtvý kód DLUH-148-3'

export default {
  nazev: 'kolečko: vlna dluhu z follow-ups',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'dluh:kolečko') return { celkem: 5, balicky: [{ soubory: ['apps/a.ts'], polozky: [{ id: 'D1', text: D1 }, { id: 'D2', text: '[řez 04 · admin] [oprava] apps/a.ts: duplicitní helper' }] }, { soubory: ['apps/b.ts'], polozky: [{ id: 'D3', text: D3 }] }] }
    if (label === 'fix:kolečko:dluh:2') return oprava({ opraveno: 0, opravene_ids: [], zmenena_mista: [], odmitnuto: [{ id: 'D3', duvod: 'kód už neexistuje' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 3, opraveno: 2, odmitnuto: 1 } })
    const sb = k.jeden('dluh:kolečko')
    k.agent(sb, 'general-purpose', 'sonnet', 'medium')
    k.obsahuje(sb, `python3 ${PLUGIN}/scripts/follow-ups.py ${CWD} --osud oprava --json`, 'skript follow-ups.py')
    const f1 = k.jeden('fix:kolečko:dluh:1'), f2 = k.jeden('fix:kolečko:dluh:2')
    k.obsahuje(f1, 'tvoje nálezy: D1, D2', 'přidělené položky'); k.obsahuje(f1, `D1: ${D1}`, 'text položky doslova'); k.obsahuje(f1, 'Sahej jen do souborů: apps/a.ts')
    k.obsahuje(f2, 'tvoje nálezy: D3')
    k.pred(k.jeden('review:kolečko:1'), sb); k.pred(f1, k.jeden('security:kolečko:čočka'))
    k.jeden('verify:kolečko:dluh:1')
    k.obsahuje(k.jeden('commit:kolečko:dluh'), 'kolecko: dluh z follow-ups', 'zprávu commitu dluhu')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, 'VYŘEŠENO <dnešní datum>: kolečko', 'přeškrtnutí opravených'); k.obsahuje(z, 'DLUH-148-1', 'opravená položka v závěru'); k.neobsahuje(z, 'DLUH-148-3', 'odmítnutá položka mezi opravenými')
    return k.chyby
  },
}
