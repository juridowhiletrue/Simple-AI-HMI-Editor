# Kleine Verbesserungen aus bewährten Editoren

Recherche: 20. November 2026. Gegenstand ist die **App Smart HMI Editor**. Die Maschinenansichten bleiben der getrennte, private Arbeitsstand **HMI-Draft Beispielprojekt**. Es wurden ausschließlich öffentliche Originaldokumentation und offizielle Repositories gelesen; keine Fremdpakete installiert, kein Fremdcode übernommen und keine der Vergleichsanwendungen praktisch erprobt.

**Empfehlung: Die vorhandene App behalten und höchstens drei kleine Bedienverbesserungen ergänzen. Eine zusätzliche Editorbibliothek ist dafür derzeit nicht nötig.** Der besondere Nutzen unserer App besteht darin, die echte vorhandene HTML-HMI direkt zu besprechen und zu verändern. Ein Wechsel auf ein fremdes Komponenten- oder Zeichenmodell würde eine zusätzliche Übersetzung einführen. Das ist unsere technische Bewertung der nachstehenden Quellen, keine Aussage der Anbieter.

## Fünf passende Referenzen

Die Lizenzangaben beziehen sich auf den jeweils verlinkten Open-Source-Kern im zum Recherchezeitpunkt zugänglichen Hauptentwicklungszweig. Zusatzprodukte und Plugins sind damit nicht pauschal mitbewertet. Vor einer späteren tatsächlichen Übernahme wäre die konkrete Version mit ihren Abhängigkeiten festzuhalten.

| Referenz und belegte Lizenz | Passende Funktion | Was wir daraus übernehmen sollten | Bewertung für unsere App |
| --- | --- | --- | --- |
| **GrapesJS Core**, [BSD-3-Clause](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/LICENSE) | Der [Layer Manager](https://grapesjs.com/docs/modules/Layers.html) zeigt Komponenten als Baum. Der [Trait Manager](https://grapesjs.com/docs/modules/Traits.html) bündelt komponentenbezogene Eigenschaften, etwa Text, Zahl, Auswahl oder Farbe. | Ein nachvollziehbarer Elementbaum und passende Eigenschaften zur aktuellen Auswahl. | Die stärkste HTML-Editor-Referenz. Für unseren begrenzten Bedarf genügt das Bedienmuster. Der [Core](https://github.com/GrapesJS/grapesjs) und der dort separat angebotene Studio SDK sind unterschiedliche Angebote; die Core-Lizenz ist keine Lizenzzusage für den Studio SDK. |
| **Craft.js**, [MIT](https://github.com/prevwong/craft.js/blob/main/LICENSE) | Ein [React-Baukasten](https://craft.js.org/docs/overview/) für eigene Editoren mit Drag-and-drop, bearbeitbaren Komponenten und serialisierbarem Zustand. Das ergänzende Paket [Layers](https://craft.js.org/docs/additional/layers) bietet einen anpassbaren Ebenenbaum mit Auswahl und aufklappbaren Unterelementen. | Auswahl in Vorschau und Navigator soll dieselbe Auswahl sein. Aussagekräftige Elementnamen sind wichtiger als technische Knotennummern. | Kein fertiger Austausch unserer App. Das React-/Komponentenmodell müsste zusätzlich eingeführt und mit der echten HMI verbunden werden. Für wenige Navigationsfunktionen unverhältnismäßig. |
| **Puck Editor**, [MIT](https://github.com/puckeditor/puck/blob/main/LICENSE) | [Outline, Fields und Preview](https://puckeditor.com/docs/editor/api-reference/components) sind getrennte, kombinierbare Oberflächen. Die [offizielle UI-Textreferenz](https://puckeditor.com/docs/editor/api-reference/dictionary) belegt Auswahlpfade, Elternauswahl und verständliche Aktionsbeschriftungen. | Klarer Wechsel zwischen „Element finden“, „Element ansehen“ und „Eigenschaften ändern“. Ein kurzer Auswahlpfad hilft bei verschachtelten Karten. | Sehr passende UX-Referenz. Die [Integration](https://puckeditor.com/docs/editor/getting-started) arbeitet mit konfigurierten Render-Komponenten und eigenen Daten. Dieses zusätzliche Modell brauchen wir für die bestehenden HTML-Seiten nicht. Cloud-/AI-Angebote gehören nicht zu dieser Empfehlung. |
| **Penpot**, [MPL-2.0](https://github.com/penpot/penpot/blob/develop/LICENSE) | [Ebenen](https://help.penpot.app/user-guide/designing/layers/) unterstützen Gruppen, Sichtbarkeit und Eigenschaften. Die [Tastaturhilfe](https://help.penpot.app/user-guide/first-steps/shortcuts/) beschreibt Navigation zwischen Geschwistern, Eltern und Kindern. | Übergeordnete Gruppe gezielt auswählen können; Tastaturaktionen dort anbieten, wo sie gebraucht werden; Befehle neben ihrem Namen erklären. | Als vollständige Designplattform deutlich größer als unser Werkzeug. Wertvoll als Bedienreferenz, nicht als einzubettender kleiner Editorbaustein. Keine Vektor-/Designsystemfunktionen für diesen Arbeitsstand nachbauen. |
| **Excalidraw**, [MIT](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | Der [Open-Source-Editor](https://github.com/excalidraw/excalidraw#features) bietet eine Zeichenfläche, Undo/Redo, Zoom und ein offenes Dateiformat. [UIOptions](https://plus.excalidraw.com/docs/sdk/excalidraw/api/props/ui-options) erlauben, sichtbare Werkzeuge und Aktionen zu begrenzen. | Wenige unmittelbar erreichbare Aktionen und eine ruhige Arbeitsfläche; vorhandene Werkzeuge gezielt zeigen, statt alle Möglichkeiten gleichzeitig aufzuspannen. | Gute Referenz für ein leichtes Arbeitsgefühl. Eine Canvas-Zeichnung ersetzt keine funktionsnahe HTML-HMI. Kollaboration und Browser-Autospeicherung der gehosteten Excalidraw-App nicht ungeprüft mit Eigenschaften des eingebetteten Pakets gleichsetzen. |

## Unsere vorhandene Grundlage

Der lokale Entwicklungsstand besitzt bereits den wesentlichen Arbeitsablauf: echte WF-HMI als getrennte Kopie, direkte Elementauswahl, Eigenschaftenbearbeitung, Seitenanordnung und Benennung, Verschieben und Kopieren von Blöcken sowie verschiedene Vorschaugrößen mit Hochformat als Schwerpunkt. Kommentare können an Elementen oder Bereichen hängen und ausführlich ergänzt werden. Undo/Redo, Änderungsübersicht, Speicherung, Wiederherstellungsweg und explizite Arbeitsstände sind Teil der bestehenden Basis.

Die ergänzte Komponentenpalette dient dem Entwurf. Eine neue Schaltfläche oder Statusdarstellung erhält dadurch noch keine reale Maschinenfunktion. Der nur lesende Programmkontext hilft bei der Zuordnung; er ersetzt keine fachliche Freigabe. Diese Einordnung stammt aus unserer Entwicklungsarbeit, nicht aus den externen Quellen. Die Recherche hat die bestehende App nicht erneut funktional abgenommen.

## Höchstens drei Ergänzungen für diesen Nachtlauf

### 1. Kleiner Elementnavigator für die aktuelle Seite

Ein aufklappbarer Bereich „Elemente“ zeigt sinnvolle Einheiten wie Karte, Überschrift, Text, Schaltfläche und Statusfeld. Kurzer Text und Elementtyp genügen als Name; technische Details bleiben nachgeordnet. Eine einfache Suche findet Elemente über ihren Namen. Vorschau und Liste verwenden dieselbe Auswahl und denselben stabilen Elementanker. Ausgeblendete Entwurfselemente bleiben in der Liste erkennbar und erreichbar.

Die Liste erzeugt keine zweite Dokumentstruktur: Sie liest die aktuelle Vorschau. Ein normaler Auswahlklick markiert das Element und bringt es bei Bedarf in Sicht. Umordnen bleibt zunächst bei den vorhandenen Aktionen; ein zweites Drag-and-drop-System ist unnötig.

### 2. Klickbarer Auswahlpfad mit Elternauswahl

Über den Eigenschaften steht beispielsweise **Hand → Zange 2 → Schaltfläche „Schließen“**. Die übergeordneten Teile sind anwählbar. Damit lässt sich die ganze Karte auswählen, wenn ein Klick in der Vorschau zuerst ihren Text getroffen hat. Vorschau, Navigator und Eigenschaften zeigen stets dasselbe Ziel.

Der Pfad ist eine Elementauswahl, kein Wechsel der Maschinenbetriebsart und keine Änderung am Entwurf. Native Schaltflächen in einer beschrifteten Gruppe reichen aus. Das [W3C-Breadcrumb-Muster](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/) liefert die Orientierungsidee; seine Semantik für Seitenlinks wird nicht blind auf Elementauswahl übertragen.

### 3. Tastatur und zugängliche Eigenschaften vervollständigen

Vorhandene Eigenschaften erhalten verknüpfte sichtbare Labels, verständliche Gruppen und einen klaren Fokus. „Text“, „Darstellung“ und „Anordnung“ dürfen kompakt aufklappbar sein; die aktuelle Auswahl bleibt dabei sichtbar. Die [W3C-Formularhilfe](https://www.w3.org/WAI/tutorials/forms/labels/) beschreibt die ausdrückliche Zuordnung von Label und Eingabefeld.

Im Navigator sind Auswahl und Fokus unterscheidbar. Für die erste kleine Ausführung genügt eine verschachtelte Liste nativer Buttons mit normalen Tabwegen. Ein echtes `tree`-Widget sollte nur verwendet werden, wenn auch die vollständige passende Pfeiltasten-/Home-/End-Bedienung des [W3C-Treeview-Musters](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) umgesetzt wird. Globale Shortcuts greifen nicht beim Schreiben in Eingabefeldern. Native Text-Undo-Funktionen bleiben nutzbar. Escape schließt eine Auswahlhilfe, ohne ungespeicherten Kommentartext zu verwerfen. Kurze sichtbare Tastaturhilfe statt zusätzlichem Kommandosystem.

## Kleine, konkrete Abnahme

Haupttestprojekt bleibt die **echte Beispielprojekt-HMI als Offline-Kopie**. Die generische Demo prüft ergänzend die Wiederverwendbarkeit. Für die drei Ergänzungen genügen diese zusammenhängenden Arbeitsproben:

1. Auf jeder der sieben vorhandenen WF-Seiten ein Element direkt und über den Navigator auswählen. Suchtreffer, Markierung, Auswahlpfad und Eigenschaften müssen dasselbe Element benennen. Alleinige Auswahl darf keine Entwurfsaktion speichern und keine Maschinenfunktion auslösen.
2. Bei verschachteltem Inhalt zwischen Text, Karte und Elternbereich wechseln. Danach eine vorhandene Umbenennung oder Anordnungsänderung durchführen, rückgängig machen und erneut laden. Die Zuordnung und vorhandene Kommentare müssen erhalten bleiben.
3. Navigator und Eigenschaften ohne Maus bedienen. Während eines längeren Kommentars normale Texteingabe und Text-Undo prüfen; Escape darf den Inhalt nicht verlieren. Im Hochformat müssen Auswahlpfad und wichtige Eigenschaften ohne überlagerte Schaltflächen erreichbar sein.

## Bewusste Grenzen

Für diesen Arbeitsstand kommen kein CMS, Cloudkonto, Team-Rechtesystem, fremdes Designsystem, Vektoreditor oder frei verdrahtbarer Ablaufeditor hinzu. Auch eine zweite KI-Oberfläche, automatische Anforderungsdeutung oder automatisch erfundene Maschinenbindungen wäre unnötig: Das klären Nutzer und Agent bereits im Chat anhand des Programms.

Die Ergänzungen gehören ausschließlich auf die App-Liste. Maschinenwünsche bleiben in den privaten HMI-Anforderungen und Kommentaren. Ein freigegebener Entwurf wird mit Quellzuordnung und Arbeitsstand an den Hauptchat übergeben. Die überprüfte Übernahme in Firmware/HMI ist eine eigene Arbeit; ein visueller DOM-Entwurf verspricht keinen automatischen fehlerfreien Rückimport. Die heute autorisierte App-Entwicklung erteilt dafür keine zusätzliche WF-/OPTA-Freigabe.

**Bibliotheksentscheidung:** Jetzt keine der fünf Bibliotheken einführen. Wenige gezielte Erweiterungen auf der bestehenden DOM-Auswahl sind überschaubarer. Neu bewerten erst bei einem konkret belegten Bedarf, den die vorhandene Struktur nicht mehr sinnvoll erfüllt.
