# Smart HMI Editor · Prüfstand A01

## 23. November 2026 · Öffentliche Demo und Skill

Die portable Kernprüfung besteht aus zehn erfolgreichen Suiten. Der neue Projektimport wurde mit 16 Fällen geprüft, darunter eindeutige und mehrdeutige Quellen, C++-HTML, unveränderte Originale und Erhalt eines bestehenden Entwurfs. Die neutrale Demo bestand 19 Prüfungen über sieben Seiten und sechs Beispielsituationen mit einem lokalen Bedienbefehl. Der installierbare Skill enthält den automatischen Projekteinstieg und den Demo-Hinweis für neue Anwender.

20. November 2026 · Editor 0.1.0 · begleitete Nutzung als Codex-Werkzeug. Primärer Aufruf im Programmierprojekt: **„Lade den Smart HMI Editor.“**

Der Editor liegt eigenständig unter `<EDITOR-ROOT>`. Der private WF-Arbeitsbereich `workspaces/beispielprojekt/` enthält die vollständige HMI von **v04-dev-2026-11-20.2** als getrennten Entwurf. Anwendung und Original-HMI im Maschinenprojekt blieben unverändert; die OPTA war während dieser Arbeit offline.

## Tatsächliche Prüfungen

| Prüfung | Ergebnis und Grenze |
| --- | --- |
| Generischer Kern | Sieben Suiten bestanden: Syntaxauswahl/-prüfung, 36 Merge-, 21 Parser-, 20 Komponenten-, 21 Zustandsfarben- und 29 Navigatorfälle. Ausschließlich synthetische Daten. |
| Codex-Projektzuordnung | 23 Fälle bestanden; eindeutige Zuordnung, unbekanntes Projekt, Pfadgrenzen, Arbeitsbereichs-ID und unveränderte Dateien. |
| Codex-Skill-Vorwärtstest | Sieben unabhängige lesende Prüfungen bestanden. Vorhandenes Projekt und neues Projekt; zusätzliche Programmkontextquellen konkret benannt. |
| Windows-Starter | 19 isolierte Fälle bestanden. Zusätzlich realer Erststart, Wiederverwendung derselben Instanz und Start eines wiederhergestellten Pakets erfolgreich. |
| Vollständiger WF-Editor | 46 Fälle bestanden, mit echter WF-HMI-JavaScriptbasis in JSDOM und lokalem In-Memory-HTTP. Enthält Speichern/Recovery, Mergekonflikte, Notizen, Seiten, Komponenten, Farben, Navigator, Programmbezug und Drag/Replay. |
| WF-UI-Testadapter | 45 Fälle mit echter WF-HMI bestanden: Befehlsannahme, Einstellungen, Bestätigungstoken, Force/A6 und Testsignale. Kein PLC-/SGM-Prozessnachweis. |
| Programmkontext | 18 Fälle bestanden; 44 belegte Befehlsgruppen, neun kuratierte Quelldateien. Original-/Cachehashes vor und nach Prüfung identisch. |
| Lokaler HTTP-Startcheck | 31 Prüfungen bestanden, einschließlich aller Ressourcen, gesperrter Dateipfade, ETag-Konflikt, Export und Snapshot-Hashes. |
| Isolation und Replay | 105 Prüfungen bestanden: generische Demo ohne WF, getrennte App-/Workspace-Wurzeln, private Schreibgrenzen und Wiederherstellung. |
| Migration | 22 Prüfungen bestanden; fachliche Arbeitsdaten gegen das Vorinventar erhalten. Eigene temporäre QA-Fixtures separat archiviert. |
| Echte Wiederherstellung | A01-Paket in eine eigene Prüfkopie kopiert, auf Loopback-Port 8251 gestartet, Seiten/Assets/Programmkontext gelesen und ausschließlich diesen Prüfserver beendet. Das Archiv blieb unverändert. |

Prüfumgebung: **Node.js v24.13.1**, npm **11.8.0**, JSDOM **26.1.0** ausschließlich als Entwicklungsabhängigkeit. Die normale Werkzeugnutzung benötigt keine installierten npm-Pakete.

## Browser und Optimierungsdurchlauf

Im integrierten Codex-Browser tatsächlich geprüft: alle sieben WF-Seiten; native und äußere Navigation; Textänderung, Originalvergleich und Rückgängig; vergrößerte Notiz, Antwort und Wiederladen; neue Seite, Umbenennen mit echter Tastatureingabe, Reihenfolge und Ausblenden; Verschieben eines neuen Bausteins zwischen Seiten; roter/grüner 0/1-Schalter; farbige Optionen einer vorhandenen Auswahlliste; Programmzuordnung und explizite Quellprüfung. Hochformat **1080 × 1920** und zusätzliche kleine Ansicht **390 × 844** geprüft.

Der vollständige Optimierungsdurchlauf behob nachgewiesene Probleme und prüfte sie erneut:

- Windows meldete einen geschlossenen Loopback-Port erst nach ungefähr zwei Sekunden. Die Portprüfung wartet jetzt bis zu drei Sekunden und unterscheidet einen belegten/fremden Arbeitsbereich zuverlässig.
- Vergrößerte Notizen konnten durch eine CSS-Priorität trotz `hidden` sichtbar bleiben. Speichern und Zuklappen verbergen sie jetzt auch in der echten Browser-Cascade.
- Unübernommene Bausteinbeschreibungen bleiben bei Auswahlwechsel und Neuladen erhalten. Offene Eingaben sind sichtbar und werden vor Snapshot/Export bewusst übernommen oder verworfen.
- UI-Aliase von Auswahllisten werden korrekt auf den belegten Programmkontext aufgelöst; Seitentitel und Feldnamen erscheinen verständlich.
- Verschobene Elemente aktualisieren ihren Elementpfad. Statusaktualisierungen erhalten dabei den Fokus.
- Der Inspektor verdeckte beim Ziehen das Ziel. Er klappt während des Ziehens weg und danach wieder auf. Der echte Browser bestätigte die Umordnung bei **100 %** und **Einpassen**.

JSDOM bildet bestimmte CSS-`!important`-Prioritäten nicht vollständig ab. Deshalb sind isolierte CSS-Regressionsfälle und die tatsächlich beobachtete Browserdarstellung getrennt dokumentiert. Browserprüfungen ersetzen keine Prüfung einer echten Maschine.

## Nachweise und Ausgangslage für die weitere Arbeit

Projektspezifische Detailberichte liegen privat unter `workspaces/beispielprojekt/qa/`; Browser-/Migrations-/Replay-Nachweise unter `.local/qa/`. Generische Testergebnisse, alle echten Projektquellen, Entwurfsdaten und Laufzeitdateien sind Git-ignoriert.

Der abgegebene WF-Entwurf enthält wieder die sieben Originalseiten, **keine Testnotizen und keine Test-Gestaltungsaktionen**. Teststände bleiben als Nachweis privat erhalten. HMI-Anforderungen werden im Workspace getrennt von App-Entwicklungswünschen geführt. Neue gedachte Funktionen bleiben violett als **„Programmierung offen“** markiert.

Ein gespeicherter Arbeitsstand verbindet Entwurf, HTML, Baseline-/Quellhashes, Editor und privaten Adapter. Die spätere Implementierung ist ein gesonderter Auftrag im zuständigen Programmierprojekt. Für ein neues Projekt ordnet Codex zuerst die Quellen zu und erstellt den passenden privaten Adapter und belegten Kontext; der Resolver behauptet kein automatisches Programmverständnis.


## 21. November 2026 · Löschfunktion für Notizen

Syntaxprüfung aller 20 generischen JavaScript-Dateien bestanden. Isolierte vollständige WF-Editorprüfung nun 49 Fälle bestanden. Drei neue Regressionen prüfen Löschen aus dem Dialog samt Pin, Speicherung und Reload, Wiederherstellen einschließlich Antworten/Bestätigungsdaten, Löschen aus der Liste mit Antwortentwurf ohne Verlust anderer Eingaben sowie die letzte noch ungespeicherte Notizfassung beim Rückgängigmachen. Im integrierten Browser wurde die aktualisierte Kommentarliste mit den neuen Löschschaltflächen angezeigt.
