// 227 · stavba · 1.11.0 (spec I2): provozní podmínka z args jde přímo do zadání deploye (hypotézy tam nedojdou; řezy 09 a 10 se nasadily během ostrého
// běhu). Nesplněná = odklad. Chybí-li vyhodnocení, blok to zaloguje a dá do follow-ups.
import { argsStavby, argsKolecko, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const P = [{ popis: 'neběží žádný import', kontrola: "psql -c 'select count(*)'", pravidlo: 'aktivních 0' }]

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
    return k.chyby
  },
}
