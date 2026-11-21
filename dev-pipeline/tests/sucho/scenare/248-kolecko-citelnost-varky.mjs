// 248 · kolečko · 1.12.0 (spec N2): fáze Dluh začíná várkami čitelnosti. Stavba vady čitelnosti z E2E neopravuje a zapisuje je do follow-ups
// („[řez NN · E2E] [oprava] čitelnost: <plocha>: <co>“); projekt s tisíci otevřených [oprava] by je v obecných várkách (3 × 40 podle závažnosti)
// nikdy nedostal na řadu. Sběr přes follow-ups.py --text 'čitelnost:' bere jen položky, jejichž text začíná „čitelnost:“, nejvýš 40 na várku
// a nejvýš pět várek, novější řez dřív; sběrný agent dohledá místo v kódu a položku bez místa vynechá (bez_mista). Oprava jde přes vlnu se zadáním
// dluhu a větou o zúžení, brána a commit „kolecko: čitelnost z follow-ups[ (várka N)]“. Řádky vzaté várkami čitelnosti obecný sběr dluhu vynechá,
// závěr je přeškrtne jako dluh a návrat nese dluh.citelnost {polozek, opraveno, zbyva} vedle počtů obecného dluhu.
import fs from 'node:fs'
import path from 'node:path'
import { argsKolecko, kontrola, oprava, zelenaBrana, NIC, CWD, PLUGIN } from '../stuby.mjs'
import { spust, BLOKY } from '../harness.mjs'

const C1 = '[řez 12 · E2E] [oprava] čitelnost: Přehled: zkratka CPC bez vysvětlení (uživatel nepozná metriku) CIT-248-1'
const C2 = '[řez 12 · E2E] [oprava] čitelnost: Přehled: částka bez měny CIT-248-2'
const C3 = '[řez 09 · E2E] [oprava] čitelnost: Export: tlačítko bez popisku CIT-248-3'
const C4 = '[kolečko · E2E] [oprava] čitelnost: Detail: stav „X“ bez legendy CIT-248-4'
const CIZI = '[řez 03 · web] [oprava] apps/web/tabulka.tsx: špatná čitelnost: kontrast řádků CIZI-248'
const G1 = '[řez 03 · api] [oprava] apps/api/a.ts: chybí validace vstupu DLUH-248-1'
const C5 = '[řez 07 · E2E] [oprava] čitelnost: Nastavení: popisek „limit“ bez jednotky CIT-248-5'
const MISTO = 'apps/web/prehled.tsx: hlavička tabulky metrik'
const zaklad = l => {
  if (l === 'dluh:kolečko:čitelnost') return { celkem: 7, bez_mista: 1, bez_mista_radky: [31], balicky: [
    { soubory: ['apps/web/prehled.tsx'], polozky: [{ id: 'D1', text: C1, radek: 12, misto: MISTO }, { id: 'D2', text: C2, radek: 15 }] },
    { soubory: ['apps/web/export.tsx'], polozky: [{ id: 'D3', text: C3, radek: 20 }, { id: 'D9', text: CIZI, radek: 22 }] }] }
  // Várka 2: nová položka a znovu položka várky 1 pod jiným id a bez řádku.
  if (l === 'dluh:kolečko:čitelnost:2') return { celkem: 7, balicky: [{ soubory: ['apps/web/detail.tsx'], polozky: [{ id: 'D4', text: C4, radek: 40 }, { id: 'D5', text: ` ${C1.toUpperCase()}` }] }] }
  // Obecný sběr vrátí i řádek, který vzala várka čitelnosti: blok ho vyřadí.
  // Obecný sběr vrátí i položku čitelnosti, kterou várky nevzaly (bez místa, řádek 31; review N1): blok ji vyřadí, zůstává ve follow-ups.
  if (l === 'dluh:kolečko') return { celkem: 300, balicky: [{ soubory: ['apps/api/a.ts'], polozky: [{ id: 'D5', text: G1, radek: 77 }, { id: 'D6', text: C2, radek: 15 }, { id: 'D7', text: C5, radek: 31 }] }] }
  if (l === 'fix:kolečko:dluh čitelnost:2') return oprava({ opraveno: 0, opravene_ids: [], zmenena_mista: [], uz_vyreseno_ids: ['D3'] })
  if (l === 'fix:kolečko:dluh čitelnost 2:1') return oprava({ opraveno: 0, opravene_ids: [], zmenena_mista: [], odmitnuto: [{ id: 'D4', duvod: 'legenda potřebuje nový přepínač', druh: 'nový mechanismus' }] })
  return null
}
const CIT = { polozek: 4, opraveno: 2, zbyva: 4 }
const DLUH = { polozek: 1, opraveno: 1, odmitnuto: 0, uz_vyreseno: 0, varek: 1, citelnost: CIT }

export default {
  nazev: 'kolečko: várky čitelnosti před obecným dluhem',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: zaklad,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: DLUH, kandidati_minirezu: [{ polozka: C4, duvod: 'nový mechanismus' }] })
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    const jeLog = (re, co) => k.ok(logy.some(l => re.test(l)), `${co}: ${logy.filter(l => /dluh/.test(l)).join(' | ')}`)

    // Sběr čitelnosti: skript s --text, jen položky od začátku textu, novější řez dřív, místo dohledá agent.
    const s1 = k.jeden('dluh:kolečko:čitelnost'), s2 = k.jeden('dluh:kolečko:čitelnost:2'), so = k.jeden('dluh:kolečko')
    k.agent(s1, 'general-purpose', 'sonnet', 'medium')
    for (const t of [`python3 ${PLUGIN}/scripts/follow-ups.py ${CWD} --osud oprava --text 'čitelnost:' --json`, 'jejichž text (pole text výstupu) začíná „čitelnost:“', 'Jdi od novějšího řezu ke staršímu', 'rg viditelného textu', 'Položku, jejíž místo nenajdeš, vynech, spočítej v bez_mista', 'prvních nejvýš 40 položek s nalezeným místem', 'dej jim id D1, D2', 'disjunktních množinách souborů', 'nic neopravuješ, nic neškrtáš']) k.obsahuje(s1, t)
    k.pole(s1, ['balicky', 'celkem', 'bez_mista', 'bez_mista_radky', 'chyba'], 'sběr čitelnosti')
    const pol = s1 ? s1.schema.properties.balicky.items.properties.polozky.items : {}
    k.ok(pol.required && pol.required.includes('radek') && pol.properties && pol.properties.misto, `položka sběru: ${JSON.stringify(pol.required)}`)
    k.neobsahuje(s1, 'Vynech i položky', 'první várka nic nevynechává')
    // Pořadí: po kole 1, před obecným dluhem a bezpečností; druhá várka až po commitu první.
    k.pred(k.jeden('review:kolečko:1'), s1); k.pred(s2, so); k.pred(so, k.jeden('security:kolečko:čočka'))
    k.pred(k.jeden('commit:kolečko:dluh čitelnost'), s2)

    // Várka 1: dva balíčky po souborech, zadání dluhu s místem a větou o zúžení; cizí položka (slovo až uvnitř textu) vyřazená.
    const f1 = k.jeden('fix:kolečko:dluh čitelnost:1'), f2 = k.jeden('fix:kolečko:dluh čitelnost:2')
    k.agent(f1, 'dev-pipeline:fix', 'opus', 'medium'); k.soubezne(f1, f2)
    for (const t of ['oprav dluh z docs/follow-ups.md', 'tvoje nálezy: D1, D2', `D1: ${C1} [místo: ${MISTO}]`, `D2: ${C2}`, 'Sahej jen do souborů: apps/web/prehled.tsx', 'Položky jsou vady čitelnosti z E2E: oprav je zúžením (text, popisek, formát hodnoty, jednotka, rozložení); novou funkci ani změnu rozhodovací logiky nedělej.', 'vrať v uz_vyreseno_ids', 'Ve follow-ups nic neškrtej']) k.obsahuje(f1, t)
    k.obsahuje(f2, 'tvoje nálezy: D3'); k.obsahuje(f2, 'Sahej jen do souborů: apps/web/export.tsx')
    k.ok(!volani.some(x => /^fix:/.test(x.label) && x.prompt.includes('CIZI-248')), 'položka bez začátku „čitelnost:“ nejde do opravy')
    jeLog(/^dluh čitelnost: 1 položek, jejichž text nezačíná „čitelnost:“, vyřazeno/, 'log vyřazení cizí položky')
    jeLog(/^dluh čitelnost: 3 položek v 2 balíčcích \(otevřených položek čitelnosti celkem 7, bez nalezeného místa vynecháno 1\)/, 'log sběru')
    // Brána a commit várky.
    k.pred(f1, k.jeden('verify:kolečko:dluh čitelnost:1')); k.pred(k.jeden('verify:kolečko:dluh čitelnost:1'), k.jeden('commit:kolečko:dluh čitelnost'))
    k.obsahuje(k.jeden('commit:kolečko:dluh čitelnost'), '„kolecko: čitelnost z follow-ups“', 'zpráva commitu várky 1')

    // Várka 2: bez řádků várky 1 a bez řádku, u kterého várka 1 místo nenašla; číslování pokračuje; položka várky 1 pod jiným id se vyřadí.
    k.obsahuje(s2, 'Vynech i položky na řádcích 12, 15, 20 (vzala je dřívější várka) a na řádcích 31 (dřívější várka u nich místo nenašla)', 'vynechané řádky'); k.obsahuje(s2, 'dej jim id D4, D5', 'pokračující číslování')
    k.obsahuje(k.jeden('fix:kolečko:dluh čitelnost 2:1'), 'tvoje nálezy: D4.', 'jen nová položka'); k.neobsahuje(k.jeden('fix:kolečko:dluh čitelnost 2:1'), 'CIT-248-1', 'položka várky 1 podruhé')
    jeLog(/^dluh čitelnost \(várka 2\): 1 položek vzatých v dřívější várce nebo zdvojených/, 'log vyřazení zdvojené položky')
    // Várka 2 nic nevyřídila: bez brány a commitu, třetí várka se nekoná, odmítnutá položka je kandidát mini-řezu.
    k.nic(/^(verify|commit):kolečko:dluh čitelnost 2/, 'brána a commit várky bez změny'); k.nic(/^dluh:kolečko:čitelnost:3$/, 'třetí várka po várce, která nic nevyřídila')
    jeLog(/^dluh čitelnost \(várka 2\): várka nic nevyřídila, další várka se nekoná/, 'log konce várek')
    jeLog(/^dluh čitelnost: 4 položek ve 2 várkách, opraveno 2, už vyřešeno 1, bez nalezeného místa 1; ve follow-ups zůstává 4 otevřených položek čitelnosti$/, 'souhrnný log čitelnosti')

    // Obecný dluh: řádky várek čitelnosti vynechá v zadání i podle řádku ve výsledku, čísluje dál a zadání opravy větu o zúžení nenese.
    k.obsahuje(so, 'kromě položek na řádcích 12, 15, 20, 40 (vzala je dřívější várka)', 'obecný sběr bez řádků čitelnosti'); k.obsahuje(so, 'dej jim id D5, D6', 'číslování přes oba druhy')
    k.obsahuje(so, `python3 ${PLUGIN}/scripts/follow-ups.py ${CWD} --osud oprava --json`, 'obecný sběr bez --text')
    k.obsahuje(so, 'položky, jejichž text (pole text výstupu) začíná „čitelnost:“, nevybírej', 'obecný sběr bez položek čitelnosti')
    const fo = k.jeden('fix:kolečko:dluh:1')
    k.obsahuje(fo, 'tvoje nálezy: D5.', 'jen obecná položka'); k.neobsahuje(fo, 'CIT-248-2', 'řádek vzatý čitelností'); k.neobsahuje(fo, 'vady čitelnosti z E2E', 'věta o zúžení v obecném dluhu')
    jeLog(/^dluh: 1 položek vzatých v dřívější várce nebo zdvojených/, 'log vyřazení řádku čitelnosti z obecného dluhu')
    jeLog(/^dluh: 1 položek čitelnosti vyřazeno \(zůstávají ve follow-ups, obecný dluh je nebere\)$/, 'log vyřazení čitelnosti bez místa z obecného dluhu')
    k.ok(!volani.some(x => /^fix:kolečko:dluh:/.test(x.label) && x.prompt.includes('CIT-248-5')), 'položka čitelnosti bez místa nejde do obecné opravy')
    k.obsahuje(k.jeden('commit:kolečko:dluh'), '„kolecko: dluh z follow-ups“', 'zpráva commitu obecného dluhu')

    // Závěr přeškrtne opravené a už vyřešené položky čitelnosti jako ostatní dluh; journal nese počty čitelnosti zvlášť.
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, `VYŘEŠENO <dnešní datum>: kolečko (hledej je podle textu): ${JSON.stringify([C1, C2, G1])}`, 'opravené položky v závěru')
    k.obsahuje(z, `VYŘEŠENO dříve (ověřilo kolečko) (hledej je podle textu): ${JSON.stringify([C3])}`, 'už vyřešená položka čitelnosti v závěru')
    k.obsahuje(z, 'dluh 1 položek ve 1 várkách, opraveno 1, už vyřešeno 0, čitelnost z follow-ups 4 položek, opraveno 2, zbývá 4;', 'počty v journalu')
    k.neobsahuje(z, 'CIZI-248', 'cizí položka v závěru'); k.neobsahuje(z, 'CIT-248-5', 'položka čitelnosti bez místa v závěru')
    // Detail fáze Dluh v meta jmenuje várky čitelnosti před obecným dluhem.
    k.ok(/title: 'Dluh', detail: 'nejdřív čitelnost z E2E řezů [^']*až pět várek po 40\), pak ostatní \[oprava\] napříč řezy podle závažnosti, až tři várky po 40/.test(fs.readFileSync(path.join(BLOKY, 'blok-kolecko.js'), 'utf8')), 'detail fáze Dluh v meta')

    // Strop pěti várek: každá várka něco opraví, šestý sběr se nekoná a log řekne, kolik zůstává.
    const strop = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => {
      const m = /^dluh:kolečko:čitelnost(?::(\d))?$/.exec(l)
      return m ? { celkem: 9, balicky: [{ soubory: [`apps/web/p${m[1] || 1}.tsx`], polozky: [{ id: `D${m[1] || 1}`, text: `[řez 0${m[1] || 1} · E2E] [oprava] čitelnost: Plocha ${m[1] || 1}: nejasné STROP-248`, radek: 100 + Number(m[1] || 1) }] }] } : null
    } })
    const st = kontrola(strop.volani)
    st.navrat(strop.vysledek, { ok: true, vysledek: 'hotovo', dluh: { polozek: 0, opraveno: 0, odmitnuto: 0, uz_vyreseno: 0, varek: 0, citelnost: { polozek: 5, opraveno: 5, zbyva: 4 } } })
    st.pocet(/^dluh:kolečko:čitelnost(:\d)?$/, 5, 'pět sběrů čitelnosti'); st.nic(/^dluh:kolečko:čitelnost:6$/, 'šestá várka')
    st.obsahuje(st.jeden('dluh:kolečko:čitelnost:5'), 'Vynech i položky na řádcích 101, 102, 103, 104 (vzala je dřívější várka)', 'řádky čtyř várek'); st.obsahuje(st.jeden('dluh:kolečko:čitelnost:5'), 'dej jim id D5, D6')
    st.jeden('fix:kolečko:dluh čitelnost 5:1'); st.jeden('verify:kolečko:dluh čitelnost 5:1')
    st.obsahuje(st.jeden('commit:kolečko:dluh čitelnost 3'), '„kolecko: čitelnost z follow-ups (várka 3)“', 'zpráva commitu várky 3')
    st.obsahuje(st.jeden('dluh:kolečko'), 'kromě položek na řádcích 101, 102, 103, 104, 105 (vzala je dřívější várka)', 'obecný sběr bez řádků pěti várek'); st.obsahuje(st.jeden('dluh:kolečko'), 'dej jim id D6, D7')
    st.ok(strop.logy.some(l => /^dluh čitelnost: 5 položek ve 5 várkách, opraveno 5, už vyřešeno 0; ve follow-ups zůstává 4 otevřených položek čitelnosti \(strop 5 várek\)$/.test(l)), `log stropu: ${strop.logy.filter(l => /dluh čitelnost:/.test(l)).join(' | ')}`)
    pod('strop várek', st)

    // Červená brána po várce čitelnosti: kolečko končí fází dluh a obecný sběr neběží. Položky várky jsou vzaté, opravená není žádná (bez zelené
    // brány vlna výsledky oprav nevrací, stejně jako u obecného dluhu); závěr neběží, takže se nic nepřeškrtne.
    const CERVENA = zelenaBrana({ selhalo: 1, exit_kod: 1, selhavajici: ['x.test.ts'] })
    const cerv = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => /^verify:kolečko:dluh čitelnost:[12]$/.test(l) ? CERVENA : zaklad(l) })
    const c = kontrola(cerv.volani)
    c.navrat(cerv.vysledek, { ok: true, vysledek: 'selhalo', faze: 'dluh', obnova_od: 'dluh', review_passed: false })
    c.rovno(cerv.vysledek && cerv.vysledek.dluh && cerv.vysledek.dluh.citelnost, { polozek: 3, opraveno: 0, zbyva: 7 }, 'počty čitelnosti selhané várky')
    c.jeden('fix-brana:kolečko:dluh čitelnost'); c.nic(/^(dluh:kolečko$|dluh:kolečko:čitelnost:2|commit:kolečko:dluh|security:)/, 'po červené bráně várky čitelnosti')
    pod('červená brána', c)

    // Obnova od fáze dluh se chová jako u obecného dluhu: sběr a opravy první várky z cache (práce je ve stromu), brána a commit živě se značkou.
    const obn = await spust({ blok: 'blok-kolecko', args: argsKolecko({ obnova: { od_faze: 'dluh', znacka: 'Z248' } }), odpoved: zaklad }, { cache: cerv.volani })
    const o = kontrola(obn.volani)
    o.navrat(obn.vysledek, { ok: true, vysledek: 'hotovo', dluh: DLUH })
    for (const l of ['review:kolečko:1', 'dluh:kolečko:čitelnost', 'fix:kolečko:dluh čitelnost:1', 'fix:kolečko:dluh čitelnost:2']) { const x = o.jeden(l); o.ok(x && x.z_cache, `${l} má přijít z cache`) }
    const vo = o.jeden('verify:kolečko:dluh čitelnost:1'), cm = o.jeden('commit:kolečko:dluh čitelnost')
    o.ok(vo && !vo.z_cache, 'brána várky čitelnosti po obnově živě'); o.obsahuje(vo, 'Obnova běhu (Z248)', 'značka obnovy v bráně')
    o.obsahuje(cm, 'Commit kolečka nebo fix(security) z přerušeného běhu může už existovat', 'commit po obnově')
    o.neobsahuje(o.jeden('dluh:kolečko:čitelnost'), 'Obnova běhu', 'sběr bez značky obnovy'); o.neobsahuje(o.jeden('fix:kolečko:dluh čitelnost:1'), 'Obnova běhu', 'oprava bez značky obnovy')
    o.jeden('dluh:kolečko:čitelnost:2'); o.jeden('dluh:kolečko')
    pod('obnova od dluhu', o)

    // Sběr čitelnosti bez výsledku nebo s chybou skriptu: várky čitelnosti se nekonají, fáze pokračuje obecným dluhem; ten položky čitelnosti
    // nebere ani tehdy (review N1), zůstávají ve follow-ups.
    const nic = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'dluh:kolečko:čitelnost' ? NIC : l === 'dluh:kolečko' ? zaklad(l) : null })
    const n = kontrola(nic.volani)
    n.ok(nic.logy.includes('dluh: 2 položek čitelnosti vyřazeno (zůstávají ve follow-ups, obecný dluh je nebere)'), `sběr bez výsledku: log ${nic.logy.filter(l => /^dluh:/.test(l)).join(' | ')}`)
    n.navrat(nic.vysledek, { ok: true, vysledek: 'hotovo', dluh: { polozek: 1, opraveno: 1, odmitnuto: 0, uz_vyreseno: 0, varek: 1, citelnost: { polozek: 0, opraveno: 0, zbyva: 0 } } })
    n.nic(/^(fix|verify|commit):kolečko:dluh čitelnost/, 'várka čitelnosti bez sběru'); n.obsahuje(n.jeden('dluh:kolečko'), 'dej jim id D1, D2', 'číslování od začátku')
    n.ok(nic.logy.some(l => /^dluh čitelnost: agent sběru nevrátil výsledek, várky čitelnosti se nekonají/.test(l)), 'log sběru bez výsledku')
    pod('sběr bez výsledku', n)
    const chyba = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'dluh:kolečko:čitelnost' ? { balicky: [], chyba: 'follow-ups.py: neznámá volba --text' } : null })
    k.ok(chyba.vysledek && chyba.vysledek.vysledek === 'hotovo' && chyba.volani.some(x => x.label === 'dluh:kolečko') && chyba.logy.some(l => /^dluh čitelnost: follow-ups\.py: neznámá volba --text; várky čitelnosti se nekonají/.test(l)), 'chyba skriptu: várky čitelnosti se nekonají, obecný dluh běží')

    // Všechny položky bez nalezeného místa: žádná oprava, počet zůstává ve follow-ups.
    const bm = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'dluh:kolečko:čitelnost' ? { celkem: 3, bez_mista: 3, bez_mista_radky: [5, 6, 7], balicky: [] } : null })
    const b = kontrola(bm.volani)
    b.rovno(bm.vysledek && bm.vysledek.dluh && bm.vysledek.dluh.citelnost, { polozek: 0, opraveno: 0, zbyva: 3 }, 'bez místa: zbývají všechny')
    b.nic(/^(fix|verify|commit):kolečko:dluh čitelnost|^dluh:kolečko:čitelnost:2$/, 'várka bez položek s místem')
    b.ok(bm.logy.some(l => /^dluh čitelnost: 0 položek ve 0 várkách, opraveno 0, už vyřešeno 0, bez nalezeného místa 3; ve follow-ups zůstává 3 otevřených položek čitelnosti$/.test(l)), `log bez místa: ${bm.logy.filter(l => /dluh čitelnost/.test(l)).join(' | ')}`)
    pod('bez místa', b)
    return k.chyby
  },
}
