# System Usage

Stream Deck Plugin für macOS mit zwei Actions, die **RAM** und **CPU** als
farbige Prozentanzeige auf einer Taste darstellen.

- Zwei Actions: **Memory** und **CPU**
- Ringanzeige mit Prozentwert, Ampelfarbe **grün → gelb → rot** je nach Schwellwert
- Optionale zweite Zeile: **GB** (belegt / gesamt) bei Memory, **Load-Average** bei CPU
- **Verlaufsgraph** in 6 Stilen (oder aus): Sparkline, Mini-Balken, Fläche, Liniengraph, Balkengraph, Hintergrund-Graph
- Memory zusätzlich umschaltbar: **Speicherdruck** oder **belegt/gesamt**
- **Tastendruck** öffnet den Aktivitätsmonitor
- Aktualisiert sich automatisch (Standard: alle 2 Sekunden)

## Messung

Alle Werte werden ohne Helper-Programm gelesen:

| Action | Wert | Quelle |
| --- | --- | --- |
| Memory – Speicherdruck | `100 − kern.memorystatus_level` | `sysctl` |
| Memory – belegt/gesamt | `(active + wired + komprimiert) / hw.memsize` | `vm_stat` + `sysctl` |
| CPU – Auslastung | Idle/Total-Delta über das Intervall | `os.cpus()` |
| CPU – Load-Average | 1 / 5 / 15 Minuten | `os.loadavg()` |

> **Warum nicht `os.freemem()`?** macOS hält kaum „freien" Speicher vor (es cached
> aggressiv), daher meldet Node dort fast immer ~98 % belegt – unbrauchbar.

## Konfiguration (Property Inspector)

**Gemeinsam (beide Actions):**

| Einstellung | Standard | Beschreibung |
| --- | --- | --- |
| Graph | Sparkline | Verlaufs-Darstellung (s. u.) |
| Label | RAM / CPU | Text unter der Zahl (entfällt bei aktiver zweiter Zeile) |
| Refresh (sec) | 2 | Aktualisierungsintervall (min. 1 s) |
| On press → Open Activity Monitor | an | Tastendruck öffnet den Aktivitätsmonitor |
| Yellow / Red from (%) | 50/75 (RAM) · 60/85 (CPU) | Ampel-Schwellen |
| Green / Yellow / Red | Apple-Systemfarben | Frei wählbare Ampelfarben |

**Nur Memory:** Metrik (Speicherdruck / belegt-gesamt), GB-Zeile an/aus.
**Nur CPU:** Load-Average-Zeile an/aus.

### Graph-Stile

| Stil | Darstellung |
| --- | --- |
| Aus | nur Ring + Prozent |
| Sparkline (klein) | Ring + dünne Verlaufslinie unten |
| Mini-Balken (klein) | Ring + kleines Balken-Histogramm unten |
| Fläche (mit Ring) | Ring + Verlauf als gefüllte Hintergrundfläche |
| Liniengraph (groß) | kein Ring, große farbige %, prominenter Linien-Chart |
| Balkengraph (groß) | kein Ring, große farbige %, Balken-/Equalizer-Chart |
| Hintergrund-Graph | Verlauf füllt die ganze Taste, % als Overlay |

Beim Metrikwechsel (Memory) wird der Verlaufsgraph zurückgesetzt.

## Installation

Voraussetzungen: macOS 12+, Node.js 20+, [Stream Deck CLI](https://docs.elgato.com/streamdeck/cli/intro).

```bash
npm install
npm run build      # baut bin/plugin.js
npm run validate   # prüft das Manifest
streamdeck link com.corrugator.systemusage.sdPlugin
streamdeck restart com.corrugator.systemusage
```

Danach in der Stream-Deck-App unter **„System Usage"** die Actions **„Memory"**
und/oder **„CPU"** auf freie Tasten ziehen.

## Entwicklung

```bash
npm run watch      # Rollup im Watch-Modus
streamdeck restart com.corrugator.systemusage   # Plugin neu laden
```

Logs unter `com.corrugator.systemusage.sdPlugin/logs/`. Log-Level in
[`src/plugin.ts`](src/plugin.ts) (`info`; zum Debuggen auf `trace`).

## Projektstruktur

```
src/
  plugin.ts                # Einstieg: registriert Memory- + CPU-Action
  memory.ts                # RAM-Messung (sysctl + vm_stat)
  cpu.ts                   # CPU-Messung (os.cpus()-Delta) + Load-Average
  render.ts                # SVG-Tastenbild (Ring, %, zweite Zeile, Graph-Stile)
  actions/
    metric-action.ts       # generische Basis: Timer, History, Settings, Render, Tastendruck
    memory.ts              # Memory-Action (Metrik-Wahl + GB-Zeile)
    cpu.ts                 # CPU-Action (Load-Zeile)
assets/
  icon.svg                 # farbiger Ring (Plugin-Icon + Memory-Key)
  cpu-icon.svg             # farbiger Chip (CPU-Key)
  icon-mono.svg            # weißer Ring – Action-/Category-Icon (Liste)
  cpu-icon-mono.svg        # weißer Chip – CPU-Action-Icon (Liste)
com.corrugator.systemusage.sdPlugin/
  manifest.json            # zwei Actions, macOS only
  ui/memory-pi.html        # Property Inspector Memory
  ui/cpu-pi.html           # Property Inspector CPU
  imgs/                    # Icons (s. u.)
  bin/plugin.js            # Build-Ergebnis
deployment/                # gepackte .streamDeckPlugin
marketplace/               # Listing-Assets für den Elgato Marketplace
```

Icon-Aufteilung nach Elgato-Guidelines: Action-Liste + Category sind **monochrom
weiß (SVG, transparent)**, das farbige Marken-Bild ist das **Key-`Image`** (PNG @1x/@2x):

| Pfad | Quelle | Größe |
| --- | --- | --- |
| `imgs/actions/{memory,cpu}/icon.svg` | `*-mono.svg` | SVG (skaliert) |
| `imgs/plugin/category.svg` | `icon-mono.svg` | SVG |
| `imgs/actions/memory/key.png` (+`@2x`) | `icon.svg` | 72 / 144 |
| `imgs/actions/cpu/key.png` (+`@2x`) | `cpu-icon.svg` | 72 / 144 |
| `imgs/plugin/icon.png` (+`@2x`) | `icon.svg` | 256 / 512 |

Icons neu erzeugen (macOS `sips`, keine Zusatztools):

```bash
cd com.corrugator.systemusage.sdPlugin
# monochrome Listen-Icons (SVG, nur kopieren)
cp ../assets/icon-mono.svg     imgs/actions/memory/icon.svg
cp ../assets/cpu-icon-mono.svg imgs/actions/cpu/icon.svg
cp ../assets/icon-mono.svg     imgs/plugin/category.svg
# farbige Key-Bilder (72 / 144) + Plugin-Icon (256 / 512)
png(){ sed -E "s/width=\"144\" height=\"144\"/width=\"$2\" height=\"$2\"/" "../assets/$1" \
       | (tmp=$(mktemp).svg; cat > "$tmp"; sips -s format png "$tmp" --out "$3" >/dev/null; sips -z "$2" "$2" "$3" >/dev/null; rm -f "$tmp"); }
for s in memory:icon cpu:cpu-icon; do a=${s%%:*}; f=${s##*:}; \
  png "$f.svg" 72 imgs/actions/$a/key.png; png "$f.svg" 144 imgs/actions/$a/key@2x.png; done
png icon.svg 256 imgs/plugin/icon.png; png icon.svg 512 imgs/plugin/icon@2x.png
```

## Tech

TypeScript · Node.js 20 · Stream Deck SDK v2 · Rollup · macOS-only (`sysctl`, `vm_stat`, `os`)
