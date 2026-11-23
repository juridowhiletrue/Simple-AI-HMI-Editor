# Simple-AI-HMI-Editor · Saubere Ausgliederung

Stand 20. November 2026. **Der Nutzer hat ein eigenes lokales Git-Repository ausdrücklich autorisiert. GitHub und andere Veröffentlichung/Synchronisierung bleiben unzulässig.** Die tatsächliche Ausgliederung, Prozessumstellung und Git-Initialisierung koordiniert ausschließlich der Root-Agent nach Ende aller Schreibarbeiten. Dieses Dokument und `qa/migration-check.cjs` führen weder Migration noch Git-Aktionen aus.

Kanonisches Ziel: `<EDITOR-ROOT>`. Der Editor wird weder Teil von `Beispielprojekt` noch von `Laborprojekt`. Die bestehende OPTA-Anwendung und ihre Freigaben bleiben unberührt.

## Zwei getrennte Produktebenen

| Ebene | Inhalt | Ablage/Versionsführung |
| --- | --- | --- |
| Simple-AI-HMI-Editor | Editorfunktionen, Bedienkomfort, Notizen, Undo, Speicherung, Vorschau, generische Prüfwerkzeuge | Editor-Kern im eigenen lokalen Repository; Anforderungen in `docs/App-Entwicklung.md` |
| HMI-Draft für Beispielprojekt | Tatsächliche Maschinenansicht, Benennungen/Anordnung, Programmkontext, Kommentare, bestätigte mögliche Programmfolgen | Nur im ignorierten Workspace `workspaces/beispielprojekt/`; eigene Liste `project/HMI-Anforderungen.md` |

Die Freigabe einer App-Funktion ist keine Freigabe einer Maschinen-HMI oder OPTA-Programmänderung. Technische Verbesserungen am Editor dürfen die fachliche WF-Anforderungsliste nicht mit vermeintlichen Maschinenanforderungen füllen.

## Zielstruktur

```text
Simple-AI-HMI-Editor/
  server.cjs                 # APP_ROOT = Editor-Verzeichnis
  package.json
  public/                    # Editor-Oberfläche
  lib/                       # generische Parser, Kontext-/Merge-Hilfen
  docs/App-Entwicklung.md     # ausschließlich Werkzeugentwicklung
  qa/                        # generische Tests; Ergebnisdateien ignorieren
  templates/demo/            # versionierte, rein generische Startvorlage
  Start-Simple-AI-HMI-Editor.*    # generische Windows-Starter
  workspaces/                # vollständig Git-ignoriert
    demo/                    # beschreibbare Laufzeitkopie der Demo
    beispielprojekt/                 # ROOT = gewählter privater Workspace
      workspace.json         # stabile Workspace-ID, optional expliziter SourceRoot
      baseline/              # unveränderte reale Ausgangsbasis + Hashes
      hmi.html               # tatsächlicher HMI-Arbeitsentwurf
      project/adapter.cjs
      project/HMI-Anforderungen.md
      project/context/       # geprüfter Cache, Modell, Quellextrakte; nur lokal
      data/                  # Notizen, Seiten, Gestaltungsschritte, lokale PID/Logs
      history/
      exports/               # private Momentaufnahmen/Replays
```

Ein leerer Clone des Editor-Kerns muss mit der generischen Demo starten können. Dazu die versionierte Demo einmal in einen beschreibbaren ignorierten Workspace kopieren; normale Bearbeitung darf die versionierte Vorlage nicht verändern. Der echte WF-Workspace bleibt verfügbar und wird für den Nutzer bewusst als **HMI-Draft** geöffnet.

## Konkretes Inventar und erforderliche Anpassungen

| Bisherige Stelle | Konkrete Abhängigkeit | Nach der Trennung |
| --- | --- | --- |
| `server.cjs` | `ROOT=__dirname`; Assets, Daten, Adapter und Paketmetadaten aus derselben Wurzel | `APP_ROOT` für `public/`, `lib/`, `package.json`; `ROOT` ausschließlich für den ausgewählten Workspace |
| `project/adapter.cjs` | Erster Import sucht mit `path.resolve(workspace,'..')` das übergeordnete WF-Projekt | WF-spezifisch im privaten Workspace. Quelle explizit konfigurieren; vorhandene Baseline niemals beim Start automatisch ersetzen |
| `project/context/build-context.cjs` | `projectRoot=path.resolve(__dirname,'../../..')` | Nach Umzug falsch: würde auf den Workspace-Sammelordner zeigen. SourceRoot aus privater Konfiguration/Argument lesen; fehlende Quelle ausdrücklich unbekannt melden |
| Kontext-Provider | Geprüftes Modell, Quellmanifest und Cache müssen zur gewählten Maschine gehören | Provider-Code generisch im Kern, echte WF-Daten im Workspace; kein neues AI-/API-Konto und kein Maschinenzugriff |
| `public/index.html` / `app.js` | Aktueller Workspace-/Projektname, Recovery und Projektvertrag | Namen/Adapterdaten aus dem aktiven Workspace. Recovery nach stabiler Workspace-ID **und** Baseline getrennt halten; identische Vorlagen verschiedener Projekte dürfen keine Notizen vermischen |
| `Start-HMI-Draft.ps1` | Server, Logs und URL aus einem Ordner; Gesundheitstest nur auf `model.name==='HMI-Draft'` | App-Pfad, Workspace und Port getrennt übergeben; Logs/PID in den Workspace. Laufenden Server nur wiederverwenden, wenn App und stabile Workspace-ID übereinstimmen |
| `Start-HMI-Draft.cmd` | Startet die bisherige PS1 im selben Ordner | Generischer Starter beziehungsweise eindeutig lokaler Workspace-Starter; keine Suchpfade zu WF/OPTA-Lab voraussetzen |
| `package.json` | `check` enthält festen Pfad `project/adapter.cjs` | Kernprüfung unabhängig vom privaten WF-Workspace; Adapterprüfung nur für explizit gewählten Workspace |
| `qa/editor-dom.cjs`, `qa/components.cjs` | `.local/hmi-test/node_modules/jsdom` aus dem WF-Projekt, WF-Adapter/Baseline und feste Anfangsseite | Generische Fixture/Demo und normale Testauflösung. Keinen versteckten Testpaketpfad innerhalb WF voraussetzen. Gegebenenfalls deklarierte reine Entwicklungsabhängigkeit; Laufzeit bleibt paketfrei |
| `qa/smoke.cjs` | Livehash über `../Plant/WebPage.h` | SourceRoot explizit, sonst Live-Frische unbekannt; Kern-Smoke muss ohne Maschine und ohne WF-Ordner laufen |
| `qa/integration-audit.cjs` | Baseline/Adapter/Daten und Kern in derselben Wurzel, virtueller Replay mit einem Root | Zwei Roots in echter und virtueller Prüfung; keine impliziten Nachbarprojekt-Lesezugriffe |
| `qa/source-keys.cjs` | Korpus `../baseline/hmi.html` bzw. `../hmi.html` | Parser-Unitfälle generisch; zusätzlicher Projektkorpus nur über expliziten Workspace |
| `qa/state-merge.cjs` | Reine synthetische Modelle, Modul aus `public/` | Kann ohne WF-Workspace versioniert bleiben; Tests dürfen keine echten Notizen einbetten |
| `docs/App-Entwicklung.md` | Bisheriger Stand sagt noch „kein Git-Auftrag“ | Auf neue lokale Git-Autorisierung aktualisieren; GitHub-Verbot erhalten |
| README/Transfer-/Integrationsdokumente | Bisher ein gemeinsamer Ordner und alter Git-Status | Neue Pfade und getrennte Freigaben eindeutig dokumentieren; private HMI-Anforderungen nicht in Kern-Dokumentation duplizieren |

## SourceRoot und Aktualität

SourceRoot ist ein ausdrücklich benannter lokaler Quellordner, kein automatisch vermuteter Elternordner und keine Geräteadresse. Für WF kann er auf den bestehenden Projektordner zeigen, wird jedoch nur gelesen. Cached Analyse und Baseline bleiben auch ohne diesen Ordner nutzbar.

Wenn SourceRoot fehlt oder nicht verfügbar ist, muss die Anzeige **„Quellfrische unbekannt / Quelle nicht verfügbar“** lauten. Ein vorhandener Cache ist dadurch weder wertlos noch neu als aktuell bestätigt. Bei verfügbarer Quelle nur die kuratierten relativen Anwendungsdateien des Quellmanifests hashen; keine Credentials, Altanlagenunterlagen, Builds oder `.git` einlesen/kopieren. Pfadtraversal und absolute Manifestpfade zurückweisen. Dokumentationsänderungen und Änderungen der eigentlichen Programmbasis getrennt behandeln.

Der geprüfte Kontext wird nur auf ausdrücklichen Analyseauftrag fachlich erneuert. Die Frischeprüfung darf ihn als unverändert/veraltet/unbekannt kennzeichnen, nicht selbst neue Programmkenntnis behaupten oder den HMI-Entwurf überschreiben.

## Windows-Start: richtige Instanz und korrektes Quoting

- App- und Workspace-Pfade kanonisch auflösen; `WorkingDirectory` auf `APP_ROOT`, Daten-/Logpfade auf den Workspace setzen.
- Workspace und Port bevorzugt als klar benannte Umgebungsvariablen/Parameter an den Node-Prozess weitergeben. Bei `Start-Process` die eine Scriptpfadangabe ausdrücklich quoten; in der CMD-Datei `%~dp0…` ebenfalls vollständig quoten. Kein JSON als vermeintliches Shell-Quoting und keine stringgebauten Befehle mit Nutzertext.
- Hintergrundserver mit `-WindowStyle Hidden` starten. Der Browser ist der sichtbare interaktive Teil.
- Der alte Server auf Port 8250 darf nach dem Umzug nicht versehentlich weiterverwendet werden. Vor einer Beendigung PID **und** tatsächlichen Serverpfad prüfen; niemals alle Node-Prozesse beenden.
- Ein reiner `model.name`-Test reicht künftig nicht: zwei Workspaces können HMI-Draft heißen und dieselbe Baseline nutzen. App-Kennung und stabile Workspace-ID prüfen. Passt eine bereits laufende Instanz nicht, bewusst einen anderen lokalen Port verwenden oder die eigene bekannte Instanz geordnet umstellen.
- Keine globalen Execution-Policy-, Firewall- oder Sicherheitsänderungen für den Starter vornehmen.

## Daten und Snapshot-Replays erhalten

Vor dem Kopieren einen endgültigen lokalen Inventar-/Hashstand erfassen, nachdem alle Agenten fertig geschrieben haben. `baseline/`, aktuelles `hmi.html`, fachliche Anforderungsliste, Kontextcache, Notizen, History und Exporte vollständig erhalten. Alte aktive PID-/Logdateien gehören nicht als gültige Prozesszuordnung in die neue App; nötigenfalls nur als Beleg archivieren.

Vorhandene Snapshot-Replays mit altem Ein-Root-Aufbau **bytegleich** bewahren. Ihre enthaltenen Dateien und Manifeste nicht nachträglich umschreiben. Neue Snapshots benötigen einen eindeutigen Zwei-Root-Aufbau, beispielsweise `replay/app/` und `replay/workspace/`, sowie getrennte Hashzuordnung/Startparameter. Der Editorcode wird aus `APP_ROOT` kopiert; Adapter, Baseline, Kontext und Daten aus `ROOT`. `package.json` gehört zum App-Root. Sonst könnte die umgestellte Snapshotfunktion leere oder nicht startbare Archive erzeugen.

Ein Backup-Verzeichnis innerhalb `workspaces/beispielprojekt/exports/` bleibt privat und Git-ignoriert, auch wenn es Editorcode enthält. Es ist kein Anlass, echte WF-Quelldateien oder Notizen in den Kern zu übernehmen.

## Was nicht mitwandert oder nicht versioniert wird

- Kein `.git` oder `.git`-Verweis aus WF oder OPTA-Lab; das neue Repository wird erst danach eigenständig lokal initialisiert.
- Keine `arduino_secrets.h`, privaten `.env`-/CLI-/Maschinenkonfigurationen, Schlüssel, Gerätesicherungsarchive, Firmware-Binaries oder Buildordner.
- Keine Altanlagenoriginale oder daraus gewonnene Unterlagen, keine fremden `node_modules`, keine pauschale Kopie des übergeordneten WF-Projekts.
- Echte WF-Baseline, Adapter, Kontext, Notizen und fachliche HMI-Anforderungen ausschließlich im ignorierten Workspace. Der generische Demo-Inhalt enthält keine Firmenkennung-/WF-Originalansicht.
- Die alte `.gitignore` mit allein `*` nicht als neue Repository-Regel übernehmen: sie würde den gesamten Editor verbergen. Neue Regeln müssen den Kern sichtbar lassen und `workspaces/` vollständig ignorieren; Ergebnisdateien, Runtime-Logs und Testpakete ebenfalls ignorieren.

## Überprüfbarer Ablauf

1. Schreibarbeiten beenden und laufende App-Eingaben speichern. Lokales Inventar erzeugen: `node qa/migration-check.cjs --capture`.
2. Nur den kuratierten Editor-Kern an das neue Ziel kopieren; echte WF-Arbeitsdaten an `workspaces/beispielprojekt/` kopieren. Quelle bis zur geprüften Rücksicherung erhalten; hier keinen bestehenden Entwicklungsstand zurücksetzen.
3. Zwei-Root-Code, SourceRoot, Starter, Tests, generische Demo und neue Snapshotstruktur anpassen. App-/HMI-Anforderungslisten getrennt halten.
4. Gegen das Vorinventar prüfen: `node qa/migration-check.cjs --verify --app-root "<EDITOR-ROOT>" --workspace "workspaces\beispielprojekt" --before "<gesichertes migration-before.json>"`. SourceRoot bei Bedarf ausdrücklich ergänzen.
5. Kern ohne WF testen, WF-Workspace offline öffnen, bestehende Notizen/IDs/Anker/Versionen vergleichen, speichern/neuladen/Kommentar/Undo/Remoteabgleich prüfen. Frische „unbekannt“ bei absichtlich entzogenem SourceRoot ebenfalls prüfen.
6. Einen neuen Zwei-Root-Snapshot erzeugen und offline wiederöffnen; alte Snapshotdateien bleiben unverändert. Start aus einem Pfad mit Leerzeichen prüfen.
7. Erst danach lokales Git im eigenen App-Verzeichnis initialisieren und eine konkrete Dateiliste kontrollieren. Ausschließlich Editor-Kern und generische Demo aufnehmen; kein Remote, kein Push und kein GitHub. Diesen Schritt führt der Root-Agent aus, nicht dieses Prüfwerkzeug.

`qa/migration-check.cjs` führt nur Dateiinventar, Klassifikation und Hash-/Pfadprüfungen aus. Es startet nichts, verschiebt nichts, schreibt keine Arbeitsdaten, ruft Git nicht auf und nutzt kein Netzwerk. Ein positiver Dateicheck ersetzt die abschließende Browserprüfung oder eine spätere Maschinenfreigabe nicht.
