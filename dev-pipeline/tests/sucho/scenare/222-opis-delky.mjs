// 222 · všechny bloky · 1.11.0 (spec E2): opis pole se porovná s _delky (délka kompaktního JSON v UTF-16 jednotkách). Stavba 14a dostala místo
// rozhodnutí o PV1 „PLACEHOLDER“ a kontrola klíčů to nepoznala. Rozdíl = načti znovu, napodruhé ok: false; soubor bez _delky se nekontroluje.
import { argsStavby, argsKolecko, argsPrd, kontrola, CWD, PLUGIN } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ROZH = ['2026-11-02 05:15 Průvodní věta s háčky a 😀 emoji']
const SPATNE = ['2026-11-02 05:15 PLACEHOLDER']
const zSouboru = o => { const data = { ...o }; return { ...data, _pole: Object.keys(data).sort(), _delky: Object.fromEntries(Object.keys(data).map(k => [k, JSON.stringify(data[k]).length])) } }
const VOLANI = { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' }
const STAVBA = zSouboru({ ...argsStavby({ rozhodnuti_majitele: ROZH, profil: 'lehky' }), rez: '05' })
const kolecko = zSouboru({ ...argsKolecko({ rozhodnuti_majitele: ROZH }), rez: 'kolecko' })
const prd = zSouboru({ ...argsPrd({ rozhodnuti_majitele: ROZH }), rez: '05' })
const beh = (blok, args, label, soubor, prvni, druhe) => spust({ blok, args, odpoved: (l, p, o, st) => {
  if (l !== label) return null
  st.data.n = (st.data.n || 0) + 1
  return st.data.n === 1 ? { ...soubor, rozhodnuti_majitele: prvni } : { ...soubor, rozhodnuti_majitele: druhe }
} })

export default {
  nazev: 'opis args: obsah pole podle _delky',
  blok: 'blok-stavby',
  args: VOLANI,
  odpoved: (l, p, o, st) => {
    if (l !== 'args:řez 05') return null
    st.data.n = (st.data.n || 0) + 1
    return st.data.n === 1 ? { ...STAVBA, rozhodnuti_majitele: SPATNE } : STAVBA
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^args:řez 05$/, 2, 'načtení a jedno nové načtení')
    k.ok(logy.some(l => /opis args nesedí se _pole \(chybí: nic; navíc: nic; jiný obsah: rozhodnuti_majitele\)/.test(l)), 'log rozdílu')
    k.obsahuje(k.jeden('implement:řez 05:1'), ROZH[0], 'správné rozhodnutí z druhého načtení'); k.neobsahuje(k.jeden('implement:řez 05:1'), 'PLACEHOLDER', 'vadný opis')
    k.obsahuje(volani[1], 'jiný obsah než v souboru měla pole: rozhodnuti_majitele', 'pokyn v druhém načtení')
    const dvakrat = await beh('blok-stavby', VOLANI, 'args:řez 05', STAVBA, SPATNE, SPATNE)
    k.ok(dvakrat.vysledek && dvakrat.vysledek.ok === false && /jiný obsah: rozhodnuti_majitele/.test(dvakrat.vysledek.duvod), `napodruhé: ${JSON.stringify(dvakrat.vysledek)}`)
    k.rovno(dvakrat.volani.map(x => x.label), ['args:řez 05', 'args:řez 05'], 'nic se nespustilo')
    const typ = await spust({ blok: 'blok-stavby', args: VOLANI, odpoved: l => l === 'args:řez 05' ? { ...STAVBA, runtime_dopad: 'true', kriteria: '8' } : null })
    k.navrat(typ.vysledek, { ok: true, vysledek: 'hotovo' })
    k.ok(typ.volani.filter(x => x.label === 'args:řez 05').length === 1, 'číslo a pravdivostní hodnota jako řetězec rozdílem nejsou')
    const { _delky: pryc, ...bezDelek } = STAVBA
    const bez = await spust({ blok: 'blok-stavby', args: VOLANI, odpoved: l => l === 'args:řez 05' ? { ...bezDelek, rozhodnuti_majitele: SPATNE } : null })
    k.navrat(bez.vysledek, { ok: true, vysledek: 'hotovo' })
    const kl = await beh('blok-kolecko', { cwd: CWD, plugin_root: PLUGIN, args_file: 'docs/.kolecko.json' }, 'args:kolečko', kolecko, SPATNE, SPATNE)
    k.ok(kl.vysledek && kl.vysledek.ok === false && /jiný obsah: rozhodnuti_majitele/.test(kl.vysledek.duvod), `kolečko: ${JSON.stringify(kl.vysledek)}`)
    const pr = await beh('blok-prd', { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' }, 'args:řez 05', prd, SPATNE, SPATNE)
    k.ok(pr.vysledek && pr.vysledek.ok === false && /jiný obsah: rozhodnuti_majitele/.test(pr.vysledek.duvod), `PRD: ${JSON.stringify(pr.vysledek)}`)
    const pr2 = await beh('blok-prd', { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' }, 'args:řez 05', prd, SPATNE, ROZH)
    k.ok(pr2.vysledek && pr2.vysledek.ok !== false, `PRD napodruhé správně: ${JSON.stringify(pr2.vysledek && pr2.vysledek.duvod)}`)
    return k.chyby
  },
}
