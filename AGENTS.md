# Agent entry point

Use [codex-skill/simple-ai-hmi-editor/SKILL.md](codex-skill/simple-ai-hmi-editor/SKILL.md) to load the tool for a new project. Start with the README. A neutral, interactive automation demo is included for first-time users. The resolver is read-only and project workspaces are local.

# Simple-AI-HMI-Editor · Arbeitsregeln

- Dieses Projekt entwickelt den **Simple-AI-HMI-Editor**. Werkzeugänderungen und Änderungen am privaten HMI-Entwurf getrennt behandeln.
- Auf Deutsch arbeiten. Zuerst README.md, docs/App-Entwicklung.md, aktiven Workspace und Prüfstand lesen. Bestehende Nutzerkommentare erhalten.
- Editor-Code gehört in dieses eigene lokale Repository. Seit dem 23. November 2026 ist das öffentliche Repository https://github.com/juridowhiletrue/Simple-AI-HMI-Editor autorisiert. Der versionierte Werkzeugkern und die neutrale Demo sind veröffentlichbar.
- `workspaces/`, echte Programmquellen/-kontexte, Baselines, Kommentare, Snapshotdaten, Zugangsdaten und Laufzeitdateien bleiben lokal und Git-ignoriert.
- Originalprojekte ausschließlich lesend als Analysequelle verwenden. Nie automatisch Maschinen-HMI, Firmware, Geräteparameter, Verdrahtung oder Ausgänge ändern. Hier keine OPTA-/Maschinenverbindung herstellen.
- Änderungen am HMI-Draft sind ein Entwurf. Neue Funktionen deutlich als unimplementiert markieren; lokale UI-Tests enden am Testadapter. Kein Testadapter ist ein Produktionsablaufnachweis.
- Jeden HMI-Wunsch auf Bedien-/Programmfolgen prüfen, diese erklären und nach fachlicher Bestätigung sauber vormerken. Bestätigung ist kein Programmier-/Übertragungs-GO. Integration erst separat mit Freigabe im zuständigen Hauptprojekt.
- Programmkontext nur auf Aufforderung ganzheitlich analysieren, Codebelege/Quellhashes führen und Kontext cachen. Geheimnisse auslassen. Fehlender/veralteter Kontext bleibt erkennbar, keine erfundene Zuordnung.
- Bestehende Baselines nicht überschreiben. Vor direkten Änderungen an Workspace-HTML lokalen Arbeitsstand sichern. Stabile `data-draft-key`-Bezüge erhalten; neue Elemente eindeutig kennzeichnen.
- Den portablen Kern mit der neutralen Demo prüfen. Private Projektadapter gezielt im jeweils beauftragten Arbeitsbereich prüfen.
- Node-Builtins und leichtgewichtige Browserfunktionen bevorzugen. Keine großen Frameworks oder Funktionen, die der Assistent einfacher/besser erledigt. Tests dürfen Entwicklungsabhängigkeiten nutzen; normale App-Nutzung bleibt paketfrei.
- Vor lokalen Commits Dateiliste/Diff und privaten Git-Ausschluss prüfen. Neue Entwicklung mit `codex/`-Zweigpräfix; fremde oder bestehende Freigaben nicht verändern.
