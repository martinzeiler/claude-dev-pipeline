# Prototyp — UI větev

Cíl: **uživatel se podívá a rozhodne.** Ne přesvědčit ho o tvém favoritovi, ne dodat hotovou obrazovku — dodat tři možnosti tak, aby rozdíl mezi nimi byl vidět na první pohled.

## 1. Zjisti, do čeho to staví (než napíšeš řádek)

- `CLAUDE.md` projektu: stack, konvence, formátovací utility, sdílené komponenty, barevná/typografická pravidla.
- **Nejbližší srovnatelná obrazovka** v aplikaci. Přečti ji celou. Prototyp, který nerespektuje, jak vypadá zbytek aplikace, rozhoduje o jiné otázce, než jakou má.
- **Kritéria z vize**, pokud existují: primární akce, informační hierarchie, hustota, prázdný / chybový / načítací stav. Podle nich se bude vybírat.
- Reálná data, ne lorem ipsum. Prototyp se rozhoduje podle toho, jak vypadá s **plným** obsahem a s **prázdným**; obojí ukaž.

## 2. Postav 3 varianty

**Přednostně uvnitř existující stránky**, ne na samostatné demo routě: v kontextu skutečné navigace, skutečných dat a skutečné šířky obsahu vypadá všechno jinak než na prázdném plátně.

Přepínání přes query parametr:

```
/nejaka/stranka?variant=a
/nejaka/stranka?variant=b
/nejaka/stranka?variant=c
```

Vzor pro React Router 7 (React 19), který projekt používá:

```tsx
import { useSearchParams } from 'react-router'

const variant = (useSearchParams()[0].get('variant') ?? 'a') as 'a' | 'b' | 'c'
```

K tomu **plovoucí lišta** s přepínačem variant, aby se uživatel nemusel hrabat v URL: fixed dole, tři tlačítka, aktivní zvýrazněné, přepnutí přes `navigate` (ne `window.location` — ztratí se stav aplikace).

**Lištu gateuj na build flag, ne na `NODE_ENV`.** Admin i portál se nasazují jako **produkční** build na Cloudflare Pages, takže podmínka `if (import.meta.env.DEV)` by lištu vypnula přesně tam, kde ji uživatel má vidět. Použij vlastní příznak, který se dá pustit i do produkčního buildu:

```tsx
if (import.meta.env.VITE_PROTOTYPE === '1') { /* lišta */ }
```

a build spusť s `VITE_PROTOTYPE=1`. Kdyby projekt takový příznak neměl a zavádět ho nechtěl, je druhá nejlepší varianta držet lištu podmíněnou přítomností `?variant=` v URL — bez parametru se nezobrazí.

### Co znamená „strukturálně různé"

Každá varianta má vyjádřit **jiné rozhodnutí**, ne jiný odstín:

- co je **primární akce** a jak moc dominuje,
- co je vidět **hned** a co až po interakci (rozbalení, druhá obrazovka, tooltip),
- jak se řeší **množství** — všechno na jedné ploše vs. krokování vs. sekce vs. progresivní odkrývání,
- jak vypadá stav, kdy **data nejsou**.

Ke každé variantě napiš **jednu větu**, čím se liší v rozhodnutí. Když ji nedokážeš napsat, varianta neexistuje.

## 3. Ukaž to

- Každou variantu ve **dvou stavech**: s reálným plným obsahem a prázdnou. U formulářů přidej stav s chybou validace.
- Screenshot per varianta a stav — jako subagent je vracej **popisem**, ne jako obrázek do orchestrátorova kontextu (jeden base64 screenshot je přes 100k tokenů).
- Napiš uživateli **URL k proklikání**, ne jen obrázky. Rozhoduje se to interakcí.

## 4. Verdikt

Ať rozhoduje uživatel (větev A) nebo agent (větev C), verdikt má vždy stejný tvar:

```
Vybráno: <varianta>
Proč: <proti kterým kritériím vize / severky vyhrála — konkrétně, ne „vypadá líp">
Bereme si z poražených: <co konkrétně a proč>
Nerozhodnuto: <co prototyp neukázal a bude potřeba dořešit>
```

Verdikt jde do vize (větev A) nebo do journalu + PRD (větev C). **Varianty se zahazují** — vítěz se staví znovu podle konvencí projektu, včetně testů. Kód prototypu není první verze implementace.

## 5. Úklid (povinný)

- Varianty odlož na odhoditelnou větev `prototyp/<slug>` (nebo commitni tam a vrať pracovní strom), aby se na ně dalo podívat později.
- **Vize branch nesmí obsahovat přepínač variant, lištu ani nepoužité varianty.** Ověř `git status` + grep na `variant=` a na jméno lišty, než fázi uzavřeš.
- Build flag, pokud jsi ho zaváděl kvůli liště, nech v projektu jen tehdy, když se to s uživatelem domluvilo; jinak ho odstraň spolu s variantami.
