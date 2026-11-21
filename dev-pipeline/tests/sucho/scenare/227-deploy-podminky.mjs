// 227 · stavba · 1.11.0 (spec I2): provozní podmínka z args jde přímo do zadání deploye (hypotézy tam nedojdou; řezy 09 a 10 se nasadily během ostrého
// běhu). Nesplněná = odklad. Chybí-li vyhodnocení, blok to zaloguje a dá do follow-ups.
// 1.12.0 (spec E): položka smí nést plati „pri-zasahu“ (omezení toho, co nasazení smí udělat): zadání ji tiskne s dovětkem, deploy bez zásahu
// vrací nevztahuje-se a nasazuje, odklad platí jen s doloženým zásahem. Odklad bez něj pustí deploy jednou znovu. Položka bez plati platí vždy
// a má dřívější text (dřív se nasazení odložilo o den jen proto, že doměření ještě neproběhlo, ačkoli se řez zmrazených tabulek nedotkl).
import { argsStavby, argsKolecko, kontrola, stub, CWD, PLUGIN } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const P = [{ popis: 'neběží žádný import', kontrola: "psql -c 'select count(*)'", pravidlo: 'aktivních 0' }]
const Z = { popis: 'doměření předchozího řezu čeká', kontrola: 'dotaz na zmrazené tabulky', pravidlo: 'nasazení do zmrazených tabulek nezapisuje', plati: 'pri-zasahu' }
const PZ = [Z, ...P]
const SPLNENO = { popis: 'neběží žádný import', vysledek: 'splneno', zmereno: '0 v 12:00' }
const odlozeni = (extra = {}) => ({ stav: 'odlozeno', commit: '', nejdriv: '2026-11-08T06:00:00+01:00', duvod: 'doměření ještě neproběhlo', podminky: [{ popis: Z.popis, vysledek: 'nesplneno', zmereno: 'čas doměření ještě nenastal', ...extra }, SPLNENO] })
// První běh deploye odloží, druhý (se stejným labelem) odpoví podle scénáře.
const dvaBehy = (prvni, druhy) => (l, p, o, st) => {
  if (l !== 'deploy:řez 05:1') return null
  st.data.n = (st.data.n || 0) + 1
  return stub(l, st.data.n === 1 ? prvni : druhy)
}

export default {
  nazev: 'provozní podmínky nasazení v zadání deploye',
  blok: 'blok-stavby',
  args: argsStavby({ deploy_podminky: P }),
  odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { podminky: [{ popis: 'neběží žádný import', vysledek: 'splneno', zmereno: '0 v 12:00' }] }) : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, "Provozní podmínky nasazení: neběží žádný import (kontrola: psql -c 'select count(*)') (pravidlo: aktivních 0)", 'podmínka v zadání')
    k.obsahuje(d, 'Vyhodnoť je čtením jako první, před commitem', 'pořadí'); k.pole(d, ['podminky'], 'DEPLOY')
    k.neobsahuje(k.jeden('uzavření:řez 05'), 'nevrátil vyhodnocení', 'follow-up s vyhodnocením')
    // Odklad přichází před commitem (spec A3), commit je tedy prázdný.
    const odklad = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: P }), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { stav: 'odlozeno', commit: '', nejdriv: '2026-11-08T06:00:00+01:00', duvod: 'běží import' }) : null })
    k.navrat(odklad.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: '2026-11-08T06:00:00+01:00' })
    k.obsahuje(k.jeden('deploy:řez 05:1'), 'přečti jako první, před commitem', 'okno před commitem (A3)')
    const kol = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => /^deploy:kolečko/.test(l) ? stub(l, { stav: 'odlozeno', commit: '', nejdriv: '2026-11-08T06:00:00+01:00', duvod: 'zakázané okno' }) : null })
    k.navrat(kol.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: '2026-11-08T06:00:00+01:00' })
    k.ok(kol.volani.some(x => /^deploy:kolečko/.test(x.label) && x.prompt.includes('přečti jako první, před commitem')), 'okno před commitem v kolečku')
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: P }), odpoved: () => null })
    const m = kontrola(bez.volani)
    m.obsahuje(m.jeden('uzavření:řez 05'), 'deploy běh 1 nevrátil vyhodnocení provozních podmínek: neběží žádný import', 'follow-up bez vyhodnocení')
    m.ok(bez.logy.some(l => /deploy běh 1 nevrátil vyhodnocení 1 provozních podmínek/.test(l)), 'log')
    k.chyby.push(...m.chyby)
    const co = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: P, deploy_mode: 'commit-only' }), odpoved: () => null })
    k.neobsahuje(kontrola(co.volani).jeden('deploy:řez 05:1'), 'Provozní podmínky', 'commit-only bez podmínek')

    // ---- 1.12.0 (spec E2): položka bez plati má dřívější text, obecná věta mluví o podmínce, která platí vždy.
    k.obsahuje(d, '(pravidlo: aktivních 0). Vyhodnoť', 'položku bez plati bez dovětku'); k.neobsahuje(d, 'platí jen při zásahu', 'dovětek u položky bez plati')
    k.obsahuje(d, 'nesplněná podmínka, která platí vždy, znamená odklad', 'obecnou větu o odkladu')
    k.ok(d && d.schema.properties.podminky.items.properties.vysledek.enum.includes('nevztahuje-se') && 'zasah' in d.schema.properties.podminky.items.properties, 'schéma podminky: nevztahuje-se a zasah')
    // Podmínka jen při zásahu: dovětek v zadání, nevztahuje-se nasazení nebrání a follow-up nezakládá.
    const NEVZTAHUJE = { podminky: [{ popis: Z.popis, vysledek: 'nevztahuje-se', zmereno: 'diff od báze jen zakládá nové tabulky' }, SPLNENO] }
    const bezZasahu = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: PZ }), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, NEVZTAHUJE) : null })
    const z = kontrola(bezZasahu.volani)
    z.navrat(bezZasahu.vysledek, { ok: true, vysledek: 'hotovo' })
    const dz = z.jeden('deploy:řez 05:1')
    z.obsahuje(dz, `${Z.popis} (kontrola: ${Z.kontrola}) (pravidlo: ${Z.pravidlo}) (platí jen při zásahu: ověř proti diffu řezu od báze, migracím a krokům po nasazení`, 'dovětek podmínky jen při zásahu')
    z.obsahuje(dz, 'bez zásahu vrať nevztahuje-se', 'návrat bez zásahu'); z.obsahuje(dz, 'odklad jen s doloženým zasah', 'odklad jen se zásahem')
    z.obsahuje(dz, "| neběží žádný import (kontrola: psql -c 'select count(*)') (pravidlo: aktivních 0). Vyhodnoť", 'druhou položku bez dovětku')
    z.pocet(/^deploy:/, 1, 'jedno nasazení')
    z.neobsahuje(z.jeden('uzavření:řez 05'), 'provozní podmín', 'follow-up k podmínkám')
    k.chyby.push(...z.chyby.map(c => `jen při zásahu: ${c}`))
    // Spec E3: odklad bez doloženého zásahu pustí deploy jednou znovu s větou v zadání.
    const znovu = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: PZ }), odpoved: dvaBehy(odlozeni(), NEVZTAHUJE) })
    const zn = kontrola(znovu.volani)
    zn.navrat(znovu.vysledek, { ok: true, vysledek: 'hotovo' })
    const behy = zn.pocet(/^deploy:řez 05:1$/, 2, 'odklad bez zásahu: deploy jednou znovu')
    if (behy.length === 2) { zn.neobsahuje(behy[0], 'odklad bez doloženého zásahu', 'větu v prvním běhu'); zn.obsahuje(behy[1], `odklad bez doloženého zásahu (${Z.popis})`, 'větu ve druhém běhu') }
    zn.ok(znovu.logy.some(l => /deploy běh 1: odklad bez doloženého zásahu \(doměření předchozího řezu čeká\); podmínky platí jen při zásahu, deploy běží jednou znovu/.test(l)), 'log odkladu bez zásahu')
    zn.ok(znovu.vysledek && (znovu.vysledek.nasazeni || []).length === 1 && znovu.vysledek.nasazeni[0].stav === 'success', `historie nese jedno nasazení, ne odklad: ${JSON.stringify(znovu.vysledek && (znovu.vysledek.nasazeni || []).map(x => x.stav))}`)
    k.chyby.push(...zn.chyby.map(c => `odklad bez zásahu: ${c}`))
    // Druhý odklad bez zásahu už platí (jedno opakování); odklad s doloženým zásahem a odklad s nesplněnou podmínkou, která platí vždy, hned.
    const dvakrat = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: PZ }), odpoved: dvaBehy(odlozeni(), odlozeni()) })
    k.navrat(dvakrat.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad' })
    k.ok(dvakrat.volani.filter(x => /^deploy:/.test(x.label)).length === 2, 'druhý odklad bez zásahu: žádné třetí volání')
    const sZasahem = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: PZ }), odpoved: dvaBehy(odlozeni({ zasah: 'migrace přidává sloupec do zmrazené tabulky' }), NEVZTAHUJE) })
    k.navrat(sZasahem.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: '2026-11-08T06:00:00+01:00' })
    k.ok(sZasahem.volani.filter(x => /^deploy:/.test(x.label)).length === 1, 'odklad s doloženým zásahem: jedno volání')
    const vzdy = { ...odlozeni(), podminky: [{ popis: Z.popis, vysledek: 'nesplneno', zmereno: 'čas nenastal' }, { ...SPLNENO, vysledek: 'nesplneno' }] }
    const smes = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: PZ }), odpoved: dvaBehy(vzdy, NEVZTAHUJE) })
    k.navrat(smes.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad' })
    k.ok(smes.volani.filter(x => /^deploy:/.test(x.label)).length === 1, 'nesplněná podmínka, která platí vždy: odklad bez opakování')
    // nevztahuje-se u podmínky, která platí vždy, je nevyhodnocená podmínka: follow-up.
    const mimo = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: P }), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { podminky: [{ ...SPLNENO, vysledek: 'nevztahuje-se' }] }) : null })
    k.obsahuje(kontrola(mimo.volani).jeden('uzavření:řez 05'), 'podmínku, která platí vždy, vrátil jako nevztahuje-se: neběží žádný import', 'follow-up nevztahuje-se u podmínky, která platí vždy')
    // Args ze souboru: plati projde opisem (_pole, _delky) beze změny a nezpůsobí „opis nesedí“.
    const data = { ...argsStavby({ deploy_podminky: PZ }), rez: '05' }
    const soubor = { ...data, _pole: Object.keys(data).sort(), _delky: Object.fromEntries(Object.keys(data).map(kl => [kl, JSON.stringify(data[kl]).length])) }
    const zeSouboru = await spust({ blok: 'blok-stavby', args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' }, odpoved: l => l === 'args:řez 05' ? soubor : l === 'deploy:řez 05:1' ? stub(l, NEVZTAHUJE) : null })
    const zs = kontrola(zeSouboru.volani)
    zs.navrat(zeSouboru.vysledek, { ok: true, vysledek: 'hotovo' })
    zs.pocet(/^args:/, 1, 'opis sedí napoprvé'); zs.obsahuje(zs.jeden('deploy:řez 05:1'), 'platí jen při zásahu', 'plati ze souboru args')
    k.chyby.push(...zs.chyby.map(c => `args ze souboru: ${c}`))
    return k.chyby
  },
}
