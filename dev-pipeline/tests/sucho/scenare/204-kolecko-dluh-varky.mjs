// 204 · kolečko · 1.10.0 (spec E1, E2, E4, kontrakt 6): vlna dluhu ve várkách. Várka 1 něco opraví, takže sběr pustí várku 2 bez
// řádků várky 1 a s pokračujícím číslováním; várka 2 nic nevyřídí (jediná položka odmítnutá jako nový mechanismus), třetí várka se
// nekoná. Odmítnutá položka jde orchestrátorovi v kandidati_minirezu a sběr bere položky napříč řezy podle závažnosti.
import { argsKolecko, kontrola, oprava, CWD, PLUGIN } from '../stuby.mjs'

const P1 = '[řez 03 · admin] [oprava] apps/a.ts: BLOKUJE chybí validace DLUH-204-1'
const P2 = '[řez 12 · api] [oprava] apps/b.ts: zámek nad datem DLUH-204-2'

export default {
  nazev: 'kolečko: dluh ve dvou várkách a kandidát mini-řezu',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'dluh:kolečko') return { celkem: 593, bez_cesty: 4, balicky: [{ soubory: ['apps/a.ts'], polozky: [{ id: 'D1', text: P1, radek: 10 }] }] }
    if (label === 'dluh:kolečko:2') return { celkem: 592, balicky: [{ soubory: ['apps/b.ts'], polozky: [{ id: 'D2', text: P2, radek: 44 }] }] }
    if (label === 'fix:kolečko:dluh 2:1') return oprava({ opraveno: 0, opravene_ids: [], zmenena_mista: [], odmitnuto: [{ id: 'D2', duvod: 'potřebuje zámek v kontraktu', druh: 'nový mechanismus' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 2, opraveno: 1, odmitnuto: 1, uz_vyreseno: 0, varek: 2 }, kandidati_minirezu: [{ polozka: P2, duvod: 'nový mechanismus' }] })
    const s1 = k.jeden('dluh:kolečko'), s2 = k.jeden('dluh:kolečko:2')
    k.obsahuje(s1, `python3 ${PLUGIN}/scripts/follow-ups.py ${CWD} --osud oprava --json`); k.obsahuje(s1, 'napříč všemi řezy', 'sběr napříč řezy')
    k.obsahuje(s1, 'nejdřív BLOKUJE, bezpečnost a data', 'řazení podle závažnosti'); k.obsahuje(s1, '`test -e`', 'vyřazení neexistujících cest')
    k.obsahuje(s2, 'kromě položek na řádcích 10', 'várka 2 bez položek várky 1'); k.obsahuje(s2, 'dej jim id D2, D3', 'pokračující číslování')
    k.pred(k.jeden('commit:kolečko:dluh'), s2)
    k.obsahuje(k.jeden('fix:kolečko:dluh 2:1'), 'tvoje nálezy: D2')
    k.nic(/^dluh:kolečko:3$/, 'třetí várka po várce, která nic nevyřídila')
    k.nic(/^(verify|commit):kolečko:dluh 2/, 'brána a commit várky bez změny')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, 'DLUH-204-1', 'opravená položka v závěru'); k.obsahuje(z, '"kandidati_minirezu"', 'kandidáti v souboru výsledku')
    return k.chyby
  },
}
