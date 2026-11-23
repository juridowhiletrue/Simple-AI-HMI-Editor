# Smart HMI App · Entwicklung des Werkzeugs

Aktualisierung 23. November 2026. Der Eigentümer hat das öffentliche GitHub-Repository und die anonymisierte Demo autorisiert. Die unten aufgeführten früheren Veröffentlichungsbeschränkungen dokumentieren den damaligen Arbeitsauftrag.

Stand 20. November 2026. Diese Liste betrifft **den Editor**, nicht die Maschinen-HMI. Produktname: Smart HMI Editor. Aktueller lokaler Arbeitsbereich: HMI-Draft für Beispielprojekt.

## Bestätigter Auftrag

- Eigenes leichtgewichtiges Werkzeugprojekt, vorerst ausschließlich durch Codex verwendet und begleitet. Der Nutzer hat das eigene lokale Git-Repository und die saubere Ausgliederung nach `<EDITOR-ROOT>` ausdrücklich autorisiert. Frühere reine „kein Git“-Vorgaben sind für den Editor-Kern ersetzt. Keine GitHub-/Remote-Synchronisierung oder Veröffentlichung; keine Git-Aktion bei normalen UI-Schritten.
- Bedienfreundliche direkte Vorschau, Hochformat eines aufgestellten Standardmonitors; 1080×1920 als veränderbares Ausgangsformat. Vergleich mit dem Original.
- Sichtbare Bezeichnungen bearbeiten; Seiten benennen, sortieren und neu aufteilen; Bereiche verschieben, duplizieren, verbreitern und ausblenden. Rückgängig/Wiederholen und gespeicherte Arbeitsstände.
- PDF-artige Notizen: Pins an Elementen, Flächenmarkierung, aufklappbare und vergrößerbare Notizfelder mit Platz für lange Erklärungen, Antworten und Bearbeitungsstand.
- Wünsche aus dem Chat werden direkt im getrennten Entwurf sichtbar. Kommentare und ungesicherte Eingaben bei Aktualisierungen erhalten; Konflikte ausdrücklich abstimmen.
- Editor-Kern, Projektadapter, Baseline, HMI-Arbeitsdatei, Kommentare und Tests getrennt halten. Das Unterprojekt soll später ohne Verlust in ein eigenständiges Smart-HMI-Editor-Projekt umziehen können.
- Jeden HMI-Wunsch auch auf tiefere Programmfolgen beurteilen. Solche Folgen erklären, einzeln bestätigen und als spätere Implementierungsanforderungen vormerken. Keine automatische Programmierung aus einer Gestaltungsidee ableiten.
- Auf Aufforderung ganzheitlichen Programmkontext erfassen: vollständige relevante Anwendung, Bedienbindung, Befehlsverarbeitung, Abläufe, Zustände, Bedingungen und Auswirkungen. Eindeutige Codebelege für Bedienelement → Befehl → Handler → Ablauf. Analyse versionieren und zwischenspeichern; Quellstand ausdrücklich prüfen statt bei jedem Klick teuer neu zu analysieren. Unbekannte Zuordnungen und externer nicht verfügbarer Kontext bleiben erkennbar. Die eigentliche fachliche Analyse erfolgt mit dem Assistenten; die lokale App bekommt ihren geprüften Kontext, keine vorgetäuschte autonome Programmverständnis-Funktion.

## Arbeitsweise

Primärer Einstieg: Im aktuellen Programmierprojekt **„Lade Smart HMI Editor“** an Codex. Der lesende Resolver `tools/codex-workspace.cjs` ermittelt den passenden privaten Workspace; Codex prüft die Zuordnung, startet mit `Start-Smart-HMI-Editor.ps1 -NoBrowser` und öffnet die bestätigte URL im integrierten Browser. Der Starter gibt Runtime-JSON zurück und startet Node bei Bedarf mit verstecktem Fenster. Ein anderer Dienst oder Workspace auf dem Port ist ein klarer Fehler. Standalone-Nutzung ist derzeit nicht vorgesehen; der vorhandene Doppelklick-Starter bleibt technischer Rückfallweg.

In der Kommunikation ausdrücklich **Arbeit an der Smart HMI App** und **Arbeit am HMI-Entwurf** unterscheiden. App-Funktionen und App-Fehler hier pflegen; fachliche HMI-Änderungen ausschließlich im privaten Workspace unter `project/HMI-Anforderungen.md` sowie in dessen Kommentaren. Editor-Code, Notizen und Beispieldaten gehören nicht in die OPTA-Anwendung.

Der gegenwärtige Auftrag implementiert die App. Der HMI-Arbeitsstand beginnt unverändert mit der gesicherten v04.2-Darstellung; vorläufige QA-Änderungen sind keine Nutzeranforderungen.

## Autorisierte Kern-/Workspace-Trennung und lokales Git

`APP_ROOT` enthält den versionierbaren Editor-Code unter `server.cjs`, `public/`, `lib/`, `tools/`, `qa/` und die rein generische Demo unter `templates/demo/`. `ROOT` bezeichnet ausschließlich den ausgewählten beschreibbaren Workspace. `workspaces/` mit echten Baselines, Adapter-/Programmkontexten, Kommentaren, Recovery und Exporten bleibt vollständig Git-ignoriert. Bestehende Maschinenfreigaben und Quellordner werden nur lesend als Vergleichsquellen verwendet.

Ein leerer Editor-Clone muss ohne WF-/OPTA-Lab-Nachbarordner mit einer lokalen Demo-Kopie starten. Die private WF-HMI bleibt Referenz für ihre vollständige Offline-Erprobung, keine Voraussetzung für generische Kerntests. Andere HMI-Strukturen benötigen weiterhin ihren passenden Adapter; universelles Programmverständnis wird nicht behauptet.

Der aktuelle Staging-Stand und der autorisierte Zielordner werden erst nach Abschluss aller Schreibarbeiten durch Root abgeglichen. Dieses Dokument weist eine Autorisierung aus, keinen vorweggenommenen Migrations- oder Commit-Erfolg. Kleine lokale Code-Stände sind zulässig; GitHub/Remotes bleiben aus. Lokale Workspace-History speichert Entwürfe weiterhin unabhängig vom App-Repository.

## Leichte Entwicklungsprüfung

Normale Nutzung benötigt nur Node-Builtins und Browserfunktionen, keine Runtime-Pakete. `npm run check` scannt nur generischen JavaScript-Code und die Demo auf Syntax; private Workspaces, Ergebnisordner, `node_modules` und Symlinks bleiben ausgeschlossen. `npm test` führt portable isolierte Tests mit synthetischen Daten aus; JSDOM 26.1.0 ist hierfür eine deklarierte Entwicklungsabhängigkeit. Reale Projektkorpora/Adapter und vollständige HMI-Interaktionen werden zusätzlich nur mit ausdrücklich gewähltem Workspace geprüft und getrennt ausgewiesen.


## 21. November 2026 · Notizen selbst löschen

Der Nutzer stellte die fehlende Löschmöglichkeit fest. In Notizdialog und Kommentarliste ist jetzt Notiz löschen vorhanden. Die bestehende Undo-/Redo-, Speicher- und History-Verarbeitung wird wiederverwendet. Offene Eingaben anderer Notizen und Antworten bleiben erhalten. Beim Entfernen werden zugehörige lokale Eingabeentwürfe bereinigt.
