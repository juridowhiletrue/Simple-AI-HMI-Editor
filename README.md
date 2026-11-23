# Smart HMI Editor

Offline HMI design and review tool for AI coding agents, with a neutral interactive automation demo.

**KI-Einstieg:** [Skill laden](codex-skill/smart-hmi-editor/SKILL.md) · [Agentenregeln](AGENTS.md) · [Kurzindex für Sprachmodelle](llms.txt)

Der Smart HMI Editor öffnet eine vorhandene Maschinen-HMI als privaten lokalen Entwurf. Mit einem KI-Assistenten lassen sich Seiten, Bedienelemente, Zustandsfarben und Kommentare bearbeiten und die Folgen für das Steuerungsprogramm besprechen.

## In einem neuen Anlagenprojekt starten

Gib deiner KI den Repository-Link und diesen Auftrag:

> https://github.com/juridowhiletrue/Smart-HMI-Editor
> Lade den Skill Smart HMI Editor und richte ihn automatisch für dieses Anlagenprojekt ein.

Der Einstieg steht unter **`codex-skill/smart-hmi-editor/SKILL.md`**. Ein Agent mit Git-/Dateizugriff kann damit den Werkzeugkern laden, den Skill installieren, die vorhandene HMI prüfen, einen privaten Workspace vorbereiten und die lokale Vorschau öffnen. Bei mehreren geeigneten Quellen klärt er die konkrete Auswahl. Änderungen und Kommentare bleiben im jeweiligen Projektworkspace erhalten.

Der Skill ist ein dokumentierter Arbeitsablauf für den Agenten. Verfügbare Werkzeuge, lokaler Dateizugriff und die jeweilige Skill-Unterstützung des KI-Systems bestimmen, welche Schritte automatisch ausgeführt werden können.

## Zuerst die Demo ausprobieren

> Lade den Skill Smart HMI Editor und öffne die Demo.

Die neutrale Bandautomation enthält Handbetrieb, Automatik, Einrichten, Einstellungen, eine Maschinenschnittstelle, E/A-Monitor und Diagnose. Testdaten zeigen unter anderem SGM-Warten, Sensorzustände und Störungen. Beschriftungen, Anordnung und Notizen lassen sich direkt ausprobieren. Alle Bedieneingriffe werden lokal im Demo-Adapter verarbeitet.

## Werkzeug lokal starten

Voraussetzung ist eine aktuelle Node.js-LTS-Version. Getestet mit Node.js 24.13.1.

```sh
git clone https://github.com/juridowhiletrue/Smart-HMI-Editor.git
cd Smart-HMI-Editor
node server.cjs
```

Ohne lokale Projektauswahl startet eine eigene Arbeitskopie der Demo auf **http://127.0.0.1:8250/**. Eine vorhandene `.editor-local.json` oder `HMI_EDITOR_WORKSPACE` wählt den dort angegebenen privaten Workspace. Der Windows-Starter `Start-Smart-HMI-Editor.ps1 -NoBrowser` gibt die geprüfte URL und Workspace-Identität als JSON zurück. Codex kann diese URL im integrierten Browser öffnen.

Für einen bewusst gewählten Demo-Start kann `HMI_EDITOR_WORKSPACE` auf `workspaces/demo` gesetzt werden, nachdem dort der Demo-Adapter vorbereitet wurde. Der Skill beschreibt die Einrichtung. Ein belegter Port mit einem anderen Workspace erfordert einen eigenen freien Port.

## Skill installieren

Codex kann den Skill aus diesem Repositorypfad installieren:

```text
Repository: juridowhiletrue/Smart-HMI-Editor
Skill path: codex-skill/smart-hmi-editor
```

Mit dem üblichen Codex-Skill-Installer lautet der Aufruf:

```text
install-skill-from-github.py --repo juridowhiletrue/Smart-HMI-Editor --path codex-skill/smart-hmi-editor
```

Die Installation des Skills und der lokale Klon des Werkzeugs sind im Skill miteinander beschrieben. Beim ersten Laden weist der Agent auf die enthaltene Demo hin.

## Architektur und private Projekte

| Bereich | Zweck |
|---|---|
| `server.cjs`, `public/`, `lib/` | Lokaler Editor-Kern |
| `templates/demo/` | Neutrale HMI mit eigenem Offline-Testadapter |
| `tools/codex-workspace.cjs` | Lesender Abgleich zwischen Projekt und Workspace |
| `tools/init-workspace.cjs` | Ersteinrichtung aus einer HTML-Datei oder eingebetteten HTML-HMI |
| `codex-skill/smart-hmi-editor/` | Installierbarer Skill und Agentenmetadaten |
| `workspaces/` | Git-ignorierte HMI-Kopien, Baselines, Kommentare und Exporte |

Der Agent beurteilt den Zusammenhang von Bedienelement, API, Bedingungen und Programmablauf anhand der jeweiligen Quellen. Ein Projektimport markiert diesen Zusammenhang zunächst als offen. Der Anwender kann Darstellungswünsche besprechen, kommentieren und als Snapshot sichern. Die Integration ins Maschinenprogramm folgt dem gesonderten Auftrag im jeweiligen Anlagenprojekt.

## Entwicklung prüfen

```sh
npm ci --include=dev
npm run check
npm test
```

Die normale App verwendet Node-Builtins. JSDOM ist ausschließlich eine Entwicklungsabhängigkeit. Tests mit synthetischen Daten und der neutralen Demo prüfen den Werkzeugkern.

## Veröffentlichung und Lizenz

Das Repository ist öffentlich lesbar. Direkte Schreibrechte werden über die GitHub-Zugriffsverwaltung des Eigentümers vergeben. [Weitergabe und private Sicherungen](docs/Weitergabe.md) beschreibt den Umgang mit echten Anlagenprojekten. Die Wahl einer Open-Source-Lizenz durch den Eigentümer steht noch aus.
