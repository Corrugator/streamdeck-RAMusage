# System Usage

Stream Deck Plugin für macOS, das **RAM**, **CPU** und **GPU** als farbige
Prozentanzeige und den **Netzwerk-Traffic** als Download-/Upload-Rate auf einer
Taste darstellt.

- Vier Actions: **Memory**, **CPU**, **GPU** und **Network**
- Ringanzeige mit Prozentwert, Ampelfarbe **grün → gelb → rot** je nach Schwellwert
- Optionale zweite Zeile: **GB** (belegt / gesamt) bei Memory, **Load-Average** bei CPU, **GPU-Speicher** bei GPU
- Network zeigt **↓ Download** und **↑ Upload** (oder nur eine Richtung) in MB/s oder Mbps, mit Verlaufsgraph und Interface-Auswahl
- **Verlaufsgraph** in 6 Stilen (oder aus): Sparkline, Mini-Balken, Fläche, Liniengraph, Balkengraph, Hintergrund-Graph
- Memory zusätzlich umschaltbar: **Speicherdruck** oder **belegt/gesamt**
- **Tastendruck** öffnet den Aktivitätsmonitor
- Aktualisiert sich automatisch (Standard: alle 2 Sekunden)

## Vorschau

**Zwei Actions – Memory & CPU**

![Memory- und CPU-Action auf Stream-Deck-Tasten](docs/preview-actions.jpg)

**Ampelfarben nach Schwellwert**

![Anzeige wechselt grün → gelb → rot je nach Wert](docs/preview-colors.jpg)

**Sieben Verlaufs-Stile**

![Von dezenter Sparkline bis Vollflächen-Graph](docs/preview-graphs.jpg)

## Messung

Alle Werte werden ohne Helper-Programm gelesen:

| Action | Wert | Quelle |
| --- | --- | --- |
| Memory – Speicherdruck | `100 − kern.memorystatus_level` | `sysctl` |
| Memory – belegt/gesamt | `(active + wired + komprimiert) / hw.memsize` | `vm_stat` + `sysctl` |
| CPU – Auslastung | Idle/Total-Delta über das Intervall | `os.cpus()` |
| CPU – Load-Average | 1 / 5 / 15 Minuten | `os.loadavg()` |
| GPU – Auslastung | `Device Utilization %` des Grafiktreibers | `ioreg` (IOAccelerator) |
| GPU – Speicher | `In use system memory` | `ioreg` (IOAccelerator) |
| Network – ↓ / ↑ | Byte-Zähler-Delta über das Intervall | `netstat -ibn` |

Bei „Alle“ zählt Network die physischen Ports (`en*`: WLAN, Ethernet,
Thunderbolt). VPN-Tunnel und die Thunderbolt-Bridge laufen über diese Ports und
würden sonst doppelt gezählt.

> **Warum nicht `os.freemem()`?** macOS hält kaum „freien" Speicher vor (es cached
> aggressiv), daher meldet Node dort fast immer ~98 % belegt – unbrauchbar.

## Konfiguration (Property Inspector)

**Gemeinsam (Memory, CPU, GPU):**

| Einstellung | Standard | Beschreibung |
| --- | --- | --- |
| Graph | Sparkline | Verlaufs-Darstellung (s. u.) |
| Label | RAM / CPU / GPU | Text unter der Zahl (entfällt bei aktiver zweiter Zeile) |
| Refresh (sec) | 2 | Aktualisierungsintervall (min. 1 s) |
| On press → Open Activity Monitor | an | Tastendruck öffnet den Aktivitätsmonitor |
| Yellow / Red from (%) | 50/75 (RAM) · 60/85 (CPU, GPU) | Ampel-Schwellen |
| Green / Yellow / Red | Apple-Systemfarben | Frei wählbare Ampelfarben |

**Nur Memory:** Metrik (Speicherdruck / belegt-gesamt), GB-Zeile an/aus.
**Nur CPU:** Load-Average-Zeile an/aus.
**Nur GPU:** GPU-Speicher-Zeile an/aus.

**Network:**

| Einstellung | Standard | Beschreibung |
| --- | --- | --- |
| Interface | Alle | Alle physischen Ports oder ein bestimmtes (WLAN, Ethernet, …) |
| Show | Download + Upload | Beide Richtungen oder nur eine |
| Unit | Bytes (MB/s) | Alternativ Bits (Mbps) |
| Graph | Liniengraph | Aus, Linien- oder Balkengraph; skaliert auf den Höchstwert im Verlauf |
| Label | NET | Text oben auf der Taste |
| Refresh (sec) | 2 | Aktualisierungsintervall (min. 1 s) |
| On press → Open Activity Monitor | an | Tastendruck öffnet den Aktivitätsmonitor |
| Download / Upload | Cyan / Orange | Farben der beiden Richtungen |

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

## Tech

TypeScript · Node.js 20 · Stream Deck SDK v2 · Rollup · macOS-only (`sysctl`, `vm_stat`, `ioreg`, `netstat`, `os`)
