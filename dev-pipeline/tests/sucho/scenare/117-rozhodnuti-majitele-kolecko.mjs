// 117 · kolečko · 1.7.0 (spec § 1.1, § 1.4, § 1.7, § 1.9): rozhodnutí majitele jde do rámce každého agenta kolečka včetně autora
// scénářů (běh sonnet-5-5: K16/K17 „spustit běh zakazuje Ne-cíl“). Autor scénářů dostane sdílené pravidlo čekání na čas, Povolení
// ze sekce vize a číslování AKn; kritérium bez Povolení vrátí v rozhodnuti a jde orchestrátorovi jako otázka. Kolo 2 se nekoná.
import { argsKolecko, kontrola, stub, CWD, PLUGIN } from '../stuby.mjs'

const R = '2026-10-06 12:50 „bez čekání, ruční běhy podle Povolení“'

export default {
  nazev: 'kolečko: rozhodnutí majitele, pravidlo čekání a Povolení',
  blok: 'blok-kolecko',
  args: { cwd: CWD, plugin_root: PLUGIN, args_file: 'docs/.kolecko.json' },
  odpoved(label) {
    if (label === 'args:kolečko') return { ...argsKolecko(), rez: 'kolecko', rozhodnuti_majitele: [R], _pole: ['base', 'deploy_mode', 'rez', 'rozhodnuti_majitele', 'runbook', 'vize'] }
    if (label === 'e2e-scénáře:kolečko') return stub(label, { rozhodnuti: ['AK6 Noční běhy na novém modelu: populace vzniká jen nočními běhy, P2 ruční běh nepokrývá, čekání ~14 h'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const x of volani.filter(x => !/^args:/.test(x.label))) k.obsahuje(x, R, 'rozhodnutí majitele v rámci')
    const s = k.jeden('e2e-scénáře:kolečko')
    k.obsahuje(s, '**Čekání na čas.**', 'sdílené pravidlo čekání na čas')
    k.obsahuje(s, 'Mantinely a Povolení', 'Povolení ze sekce vize')
    k.obsahuje(s, 'nikdy K', 'číslování AKn')
    k.pole(s, ['rozhodnuti'], 'SESTAV')
    k.ok(v && (v.rozhodnuti || []).some(x => /AK6 Noční běhy/.test(x) && /rozšířit Povolení, nebo čekat/.test(x)), `rozhodnuti: ${JSON.stringify(v && v.rozhodnuti)}`)
    k.nic(/^(review:kolečko:2|triáž:kolečko)/, 'kolo 2 je zrušené')
    return k.chyby
  },
}
