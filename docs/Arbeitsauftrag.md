# Smart HMI Editor · Aktiver Arbeitsauftrag

Aktualisierung 23. November 2026. Der Eigentümer hat das öffentliche GitHub-Repository und die anonymisierte Demo autorisiert. Die unten aufgeführten früheren Veröffentlichungsbeschränkungen dokumentieren den damaligen Arbeitsauftrag.

Nutzerauftrag 20. November 2026, Fachchat HMI-Visu. Der Nutzer ist bis morgens nicht für Rückfragen erreichbar. Sinnvolle Entscheidungen eigenständig treffen; keine Rückfragen. Nach vollständiger Implementierung ausdrücklich **alle Funktionen und die Usability ausführlich prüfen, einen kompletten Optimierungsloop durchführen und den finalen Stand erneut prüfen**. Ergebnisse und benutzbare App hier bereitstellen.

## Abgrenzung

- **Smart HMI App / Smart HMI Editor:** Eigenes Werkzeugprojekt, vorerst ausschließlich als Codex-Tool. Keine unabhängige Standalone-Nutzung. Neue ausdrückliche Nutzerautorisierung: sauber in `<EDITOR-ROOT>` ausgliedern und dort ein eigenes lokales Git-Repository führen. Root koordiniert Übernahme und Initialisierung nach Ende aller Schreibarbeiten. Frühere Verbote eines separaten lokalen App-Git sind insoweit historisch. Keine GitHub-/Remote-Synchronisierung oder Veröffentlichung.
- **HMI-Draft:** Der private Maschinen-HMI-Entwurf für Beispielprojekt unter ignoriertem `workspaces/beispielprojekt/`. Kopie des vorhandenen v04.2-Stands, klar als Entwurf gekennzeichnet. Fachliche Wünsche dort sammeln/abstimmen; tatsächliche Implementierung separat nach Freigabe im Hauptchat. Nicht mit dem App-Repository vermischen.
- OPTA ist offline und nicht vor Ort. Keine Geräteverbindung, Programm-/Parameteränderung oder Ausgangsschaltung. Originalprojekte ausschließlich über ausdrücklich konfigurierte lokale Quellpfade lesen und unverändert erhalten; keinen Nachbarordner voraussetzen.

## Wesentliche Funktionen

Primärer Einstieg ist **„Lade Smart HMI Editor“** im aktuellen Programmierprojekt. Codex ermittelt mit dem lesenden Resolver `tools/codex-workspace.cjs` den passenden privaten Workspace, verwendet den Starter mit `-NoBrowser` und öffnet die verifizierte lokale URL im integrierten Browser. Der Starter gibt Runtime-JSON mit App-/Workspace-Zuordnung zurück. Keine stille Auswahl eines anderen oder mehrdeutigen Projekts. Der Doppelklick-Starter bleibt ein technischer Rückfallweg.

Direkte interaktive HMI-Vorschau, Hochformat 1080×1920 als veränderbares Standardmonitor-Preset; Texte/Benennungen bearbeiten, Seiten ordnen/benennen/neu aufteilen, Bereiche verschieben und als Layout-Kopie duplizieren; Undo/Redo, lokales Speichern/Recovery, Originalvergleich und eindeutig gespeicherte Arbeitsstände.

PDF-artige Notizen an Elementen und markierten Flächen, aufklappbar, für lange Texte vergrößerbar; Antworten und Bearbeitungsstand. Wünsche aus dem Chat direkt in der Vorschau zeigen, ohne laufende Eingaben still zu ersetzen. App-Feedback und HMI-Anforderungen getrennt führen.

Auf Aufforderung ganzen Programmkontext fachlich erfassen. Belegte Kette UI → Befehl → Handler → Ablauf → Bedingungen/Wirkungen; geprüfter Cache plus explizite Aktualitätsprüfung. Kontextanalyse mit Assistent statt vorgetäuschtem autonomen Programmverständnis. Geheimnisse ausschließen. Für neue Projekte eigene Analyse/Adapter, keine unbegründeten Universalversprechen.

Jeden HMI-Wunsch auf tiefere Programmfolgen prüfen. Folgen erklären; nach fachlicher Bestätigung als eigene Implementierungsanforderung vormerken. Nicht als Programmier-GO behandeln. Offene Punkte während der Nacht dokumentieren, keine Nutzerfrage stellen.

## Umsetzungs- und Prüfrahmen

Node-Builtins und keine Runtime-Abhängigkeiten; die rein generische Demo muss ohne echte Maschinenquellen starten. JSDOM 26.1.0 ist ausschließlich für Entwicklungs-/DOM-Tests deklariert. Der Server bindet nur `127.0.0.1`, standardmäßig Port 8250; einen anderen Port bewusst konfigurieren. Localhost benötigt in dieser Umgebung einen außerhalb der Netzwerksandbox gestarteten, versteckten Node-Prozess. Nur eigenen anhand PID+CommandLine und Workspace-Zuordnung geprüften Prozess umstellen. Ein anderer auf dem Port laufender Workspace ist ein klarer Startfehler, kein Anlass für einen zweiten Start.

QA getrennt unter `qa/`, keine Nutzerkommentare für Tests überschreiben. Standardprüfungen (`npm run check`, `npm test`) verwenden nur den generischen Kern beziehungsweise synthetische Fixtures; tatsächliche private HMI-Korpora werden ausdrücklich über `--workspace` gewählt. Baseline geschützt, Snapshot mit HTML/Model/Editor-/Adapter-Fingerprints und Replay-Kopie. Lokales Git führt den Editor-Kern, nicht die privaten Arbeitsstände. Erst nach zusätzlicher ausdrücklicher Freigabe Integrationspaket/Git für die tatsächliche Maschinen-HMI vorbereiten.
