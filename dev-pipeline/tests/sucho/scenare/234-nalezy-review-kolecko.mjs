// 234 · kolečko · 1.11.0 (nálezy review a plan-checku verze): jen_kriteria nesmí nechat FAIL zmizet bez měření, verdikty čte přes všechna kola a scénáře
// nepřepisuje; neopravený blokující nález review opravy nezmizí, bezpečnostní balíček jde deployi; sekce, které nepokrývají všechna kritéria,
// měří jeden verifikátor; přenos skupin jen při oblastech tvaru cesty a se všemi změnami opravy.
import { argsKolecko, kontrola, stub, e2ePass, oprava, parsujLabel, NIC } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = n => e2ePass(n, { vysledek: 'fail', pass: n - 1, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: '500' }] })
const OBNOVA = { od_faze: 'deploy', znacka: 'Z234', jen_kriteria: ['AK2', 'AK5'] }
const MINULE = { kriteria: [{ kriterium: 'AK1 A', verdikt: 'pass' }, { kriterium: 'AK2 B', verdikt: 'pass' }, { kriterium: 'AK5 E', verdikt: 'fail', popis: 'padá' }] }
const REVIEW = (extra = {}) => stub('review:kolečko:oprava-e2e', { nalezu: 1, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/export.ts'], nalezy: ['N1'], ...extra }], follow_up_ids: [] })

export default {
  nazev: 'nálezy review verze: kolečko',
  blok: 'blok-kolecko',
  args: argsKolecko({ obnova: OBNOVA }),
  odpoved: l => l === 'e2e-stav:kolečko' ? MINULE : l === 'e2e:kolečko:1' ? e2ePass(1) : null,
  async over(v, volani) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))

    // Verifikátor nezměřil všechna jmenovaná: FAIL nesmí zmizet.
    k.navrat(v, { vysledek: 'selhalo', faze: 'e2e' })
    k.obsahuje(k.jeden('e2e-scénáře:kolečko'), 'nepřepisuj ani nepřečíslovávej', 'scénáře se při výběru nemění')
    k.obsahuje(k.jeden('e2e-stav:kolečko'), 'poslední verdikt napříč koly', 'verdikty přes všechna kola')

    // Bezpečnostní balíček z review opravy jde deployi jako fix(security).
    const sec = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? FAIL(5) : l === 'review:kolečko:oprava-e2e' ? REVIEW({ security: true }) : null })
    const ms = kontrola(sec.volani)
    ms.navrat(sec.vysledek, { vysledek: 'hotovo' })
    ms.obsahuje(ms.jeden('deploy:kolečko:2'), 'Bezpečnostní opravy: N1', 'bezpečnostní oprava v zadání deploye')
    pod('bezpečnost', ms)

    // Fix bez výsledku: blokující nález jde do follow-ups.
    const bf = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? FAIL(5) : l === 'review:kolečko:oprava-e2e' ? REVIEW() : l === 'fix:kolečko:opravy po E2E:1' ? NIC : null })
    const mb = kontrola(bf.volani)
    mb.obsahuje(mb.jeden('závěr:kolečko'), 'zůstal neopravený: N1', 'follow-up neopraveného nálezu')
    pod('fix bez výsledku', mb)
    const bb = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? FAIL(5) : l === 'review:kolečko:oprava-e2e' ? { ...REVIEW(), balicky: [] } : null })
    const mbb = kontrola(bb.volani)
    mbb.obsahuje(mbb.jeden('závěr:kolečko'), 'zůstal neopravený: 1 blokujících bez balíčku', 'blokující bez balíčku')
    pod('bez balíčku', mbb)

    // Sekce za 14 z 20 kritérií: skupiny by šest kritérií nezměřily.
    const SE = { e2e_path: '/x', kriterii: 20, plochy: [], e2e_sekce: [{ nazev: 'A', kriterii: 7, doba_min: 10 }, { nazev: 'B', kriterii: 7, doba_min: 30 }] }
    const ne = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? SE : l === 'e2e:kolečko:1' ? e2ePass(20) : null })
    const mn = kontrola(ne.volani)
    mn.nic(/^e2e:kolečko:1:[ab]$/, 'skupiny nad neúplnými sekcemi'); mn.jeden('e2e:kolečko:1')
    mn.rovno(ne.vysledek && ne.vysledek.e2e && ne.vysledek.e2e.celkem, 20, 'změřeno všech 20')
    pod('neúplné sekce', mn)

    // Přenos: oblast bez tvaru cesty se nepřenáší; změna z review opravy se počítá.
    const zelena = (l, n) => { const p = parsujLabel(l); return p.typ === 'e2e' && p.pismeno ? e2ePass(n, { report_path: `/r/${p.kolo}-${p.pismeno}.md` }) : null }
    const dvaFail = { vysledek: 'fail', pass: 1, fail: 2, fail_kriteria: [{ kriterium: 'AK4 x', selhani: 'y' }], report_path: '/r/1-b.md' }
    const MOD = { e2e_path: '/x', kriterii: 6, plochy: [], e2e_sekce: [{ nazev: 'Web', kriterii: 3, doba_min: 15, oblasti: ['web'] }, { nazev: 'Admin', kriterii: 3, doba_min: 15, oblasti: ['admin'] }] }
    const mod = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? MOD : l === 'e2e:kolečko:1:b' ? e2ePass(3, dvaFail) : l === 'fix-e2e:kolečko:1' ? oprava({ zmenena_mista: ['apps/admin/x.ts: g'] }) : zelena(l, 3) })
    const mm = kontrola(mod.volani)
    mm.jeden('e2e:kolečko:2:a'); mm.jeden('e2e:kolečko:2:b')
    pod('oblast bez cesty', mm)
    const CES = { e2e_path: '/x', kriterii: 6, plochy: [], e2e_sekce: [{ nazev: 'A', kriterii: 3, doba_min: 15, oblasti: ['apps/a'] }, { nazev: 'B', kriterii: 3, doba_min: 15, oblasti: ['apps/b'] }] }
    const ces = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? CES : l === 'e2e:kolečko:1:a' ? e2ePass(3, { ...dvaFail, report_path: '/r/1-a.md' }) : l === 'fix-e2e:kolečko:1' ? oprava({ zmenena_mista: ['apps/a/x.ts: f'] }) : l === 'review:kolečko:oprava-e2e' ? { ...REVIEW(), balicky: [{ soubory: ['apps/b/y.ts'], nalezy: ['N1'] }] } : l === 'fix:kolečko:opravy po E2E:1' ? oprava({ opravene_ids: ['N1'], zmenena_mista: ['apps/b/y.ts: f'] }) : zelena(l, 3) })
    const mc = kontrola(ces.volani)
    mc.jeden('e2e:kolečko:2:b')
    pod('změna z review', mc)

    // Závěr nepřidá opakovanou položku „zlevnit stráž“.
    const z = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: () => null })
    k.obsahuje(z.volani.find(x => x.label === 'závěr:kolečko'), 'Položku „zlevnit stráž: <test>“ vynech', 'pravidlo v závěru')
    return k.chyby
  },
}
