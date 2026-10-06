// 98 · stavba · 1.6.0 (spec § 2 A1, review 1.6.0 N9 a N10): oprava po E2E, která změnila jen kód mimo apps a packages (měřicí nástroj
// řezu 10 v běhu web-rijen), projde bránou a jde commitem bez nasazení; kolo 2 E2E ověřuje dál nasazený commit. Návrat hlásí stav
// a health posledního nasazení, ne commit-only commitu opravy, a vynechané kroky commitu nejsou úkoly pro majitele.
import { argsStavby, kontrola, e2ePass, oprava, hash } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK19: porovnání vzhledu padá'] })

export default {
  nazev: 'oprava po E2E mimo kód: brána a commit bez nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['scripts/vzhled/prohlizec.mjs: porovnej'] })
    if (label === 'deploy:řez 05:2') return { stav: 'commit-only', commit: hash('oprava mimo kód'), security_commity: [], health: 'jen commit', kroky_po_nasazeni: [{ id: 1, krok: 'purge keše', stav: 'vynechano', duvod: 'jen commit' }], infra: false }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('verify:řez 05:e2e')
    k.obsahuje(k.jeden('deploy:řez 05:2'), 'jen commitni, nic nenasazuj', 'commit bez nasazení')
    k.obsahuje(k.jeden('e2e:řez 05:2'), hash('deploy:řez 05:1#1'), 'nasazený commit z nasazení 1')
    k.ok(v && v.deploy === 'success', `návrat.deploy má být success z nasazení 1: ${JSON.stringify(v && v.deploy)}`)
    k.ok(v && !/jen commit/.test(v.health || ''), `návrat.health z nasazení 1: ${JSON.stringify(v && v.health)}`)
    k.ok(v && v.commit === hash('oprava mimo kód'), `návrat.commit je commit opravy: ${JSON.stringify(v && v.commit)}`)
    k.ok(v && !(v.rozhodnuti || []).some(x => /pro majitele/.test(x)), `falešný úkol pro majitele: ${JSON.stringify(v && v.rozhodnuti)}`)
    return k.chyby
  },
}
