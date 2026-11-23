# Smart HMI Editor · Trennung und spätere Übernahme

Aktualisierung 23. November 2026. Der Eigentümer hat das öffentliche GitHub-Repository und die anonymisierte Demo autorisiert. Die unten aufgeführten früheren Veröffentlichungsbeschränkungen dokumentieren den damaligen Arbeitsauftrag.

Der Maschinen-Arbeitsbereich heißt **HMI-Draft**; das Werkzeug heißt **Smart HMI Editor**. Beide sind kein zusätzlicher Programmstand der OPTA. Erst ein später ausdrücklich freigegebener Maschinenentwurf wird zur Implementierung an den Hauptchat übergeben.

**Neue Nutzerautorisierung vom 20. November 2026:** Eigenes lokales Git für die Editor-App ist jetzt ausdrücklich zulässig und gewünscht. GitHub, Remotes und Veröffentlichung bleiben nicht beauftragt. Der Root-Agent koordiniert nach Ende aller Schreibarbeiten die Ausgliederung nach `<EDITOR-ROOT>` und die lokale Initialisierung. Dieses Dokument und seine Prüfwerkzeuge führen keine Migration oder Git-Aktion aus.

## App und Maschinen-HMI getrennt führen

Editoranforderungen und App-Fehler stehen ausschließlich in `docs/App-Entwicklung.md`. Fachliche Änderungen an der echten WF-HMI stehen im privaten Workspace unter `project/HMI-Anforderungen.md` und in ihren Kommentaren/Gestaltungsschritten. Pins, Notizfelder, Undo, Vorschau und Kontextanzeige sind App-Funktionen, keine neuen Maschinenanforderungen. Die Freigabe einer App-Verbesserung darf nicht als OPTA-Programmierfreigabe behandelt werden.

## Was schon sauber getrennt ist

- `baseline/` hält Originalquelle, Originalansicht, Quellversion und Hashes. Gestaltungsschritte und Kommentare werden davon getrennt gespeichert.
- `hmi.html` ist die Kopie. `data/draft.json` enthält die Arbeitsdaten; `history/` und `exports/` bleiben ausschließlich lokale Arbeitsstände.
- `server.cjs`, `public/` und `lib/` bilden den Editor-Kern. Echte WF-Baseline, `project/adapter.cjs`, Programmkontext und Notizen werden beim autorisierten Umzug unter ignoriertem `workspaces/beispielprojekt/` abgelegt. Eine versionierte generische Demo startet ohne reale Maschinenunterlagen.
- Der Server bindet nur `127.0.0.1`, bietet feste Routen an und hat keinen OPTA-Client. Maschinenbefehle aus der Vorschau werden nicht ausgeführt.
- Nach dem ersten Import kann der vollständige Ordner ohne sein früheres übergeordnetes Projekt starten. Für andere HMI-Strukturen braucht es weiterhin einen passenden Adapter; universelle Projektunterstützung ist noch keine zugesagte Funktion.

## Leichtgewichtig arbeiten und Daten erhalten

Die lokale History erhält die Maschinenentwürfe unabhängig vom nun autorisierten lokalen Git des Editor-Kerns. Speichern muss vorhandene Notizen und Änderungen erhalten; eine ältere Browsersitzung darf neue Daten aus dem Chat nicht überschreiben. Bei einer Kollision bleiben lokale Eingaben als Recovery erhalten, bis die Differenz bewusst geklärt ist. Ein fehlgeschlagenes Speichern darf niemals mit einer erfolgreichen Momentaufnahme oder einem vollständigen Export verwechselt werden.

`public/state-merge.js` ist eine reine Drei-Wege-Merge-Hilfe für Arbeitsmodelle. Sie verbindet unabhängige Änderungen anhand stabiler IDs und erhält unterschiedliche Antworten anhand von Text und Zeitpunkt. Echte Kollisionen enthalten beide Alternativen und brauchen eine bewusste Auflösung; bei unvereinbaren Ausgangshashes wird nicht automatisch zusammengeführt. Die Hilfe ersetzt keine fachliche Bewertung der Bedeutung von Bezeichnungen oder Befehlen. Unterschiedliche neu hinzugefügte Kommentare können dieselbe sichtbare Nummer mitbringen: Bestehende Remote-Nummern bleiben bevorzugt erhalten, lokale neue Doppelnummern erhalten konfliktfrei die nächste freie Nummer. IDs und Anker bleiben unverändert. Generische Daten ohne Nummer bekommen keine künstliche Nummer.

## Ein freigegebener Arbeitsstand braucht eine eindeutige Ansicht

Neue Momentaufnahmen enthalten zusammengehörige Entwurfsdaten und `hmi.html` mit Hashes sowie den verwendeten Editor-/Adaptercode im Unterordner `replay/`. Das Manifest benennt Produkt, Editor-Version und die Fingerprints dieser Dateien. Die Ausgangsquelle und ihre Hashes bleiben ebenfalls erhalten. So wird nicht nur eine Beschreibung der Änderungen gesichert, sondern auch die dafür verwendete Ansicht und Wiedergabe. Der Audit startet einen solchen vollständigen Replay rein virtuell erneut und vergleicht Basis, Serial und Notizen. Der erste alte QA-Snapshot ohne Editorbezug bleibt historisch; er ist kein aktiver Freigabestand.

## Vom sichtbaren Entwurf zur tatsächlichen HMI

1. Einen fixierten Arbeitsstand samt Nutzerfreigabe auswählen. Offene Kommentare und bestätigte Programmfolgen eindeutig dazulegen.
2. Dessen Ausgangshash mit der **dann** aktuellen Hauptchat-HMI vergleichen. Abweichungen werden abgeglichen; der aktuelle Live-Stand wird niemals durch die alte Kopie ersetzt.
3. Gestaltungsschritte in minimale Änderungen an der produktiven Darstellung übersetzen. Editor, Notiz-Pins, Recovery, lokale APIs und Beispieldaten gehören nicht in die OPTA-Firmware.
4. Technische IDs, `data-cmd`, interne Seitenkennungen und Berechtigungs-/Start-/Stop-/Force-Verhalten erhalten, soweit kein eigener fachlicher Änderungsauftrag vorliegt.
5. Neue Seiten oder duplizierte Bedienelemente auf echte Bindung und Zustände prüfen. `cloneNode` überträgt keine registrierten Eventhandler; eine Layout-Kopie belegt keine funktionsfähige Bedienung.
6. Die geänderten Ansichten und Befehlsbindungen prüfen, einschließlich Hochformat, Datenfrische und unbekannter Zustände. Erst im Hauptchat Ressourcen/Build und gegebenenfalls Geräteübertragung bearbeiten.

Positionsabhängige Elementschlüssel sind ein Prüffall: Wird `hmi.html` strukturell geändert, kann derselbe `nth-of-type`-Bezug auf ein anderes Element zeigen. Vor einer solchen Änderung die vorhandenen Schritte gezielt auf neue stabile Bezüge abbilden oder ihre Zuordnung bestätigen. Nicht auflösbare beziehungsweise mehrdeutige Bezüge sperren die automatische Übernahme.

Jedes Feedback wird außerdem auf tiefere Bedien-/Programmfolgen bewertet. Nötige Folgen werden zuerst verständlich erklärt; nach Nutzerbestätigung als eigene Implementierungsvormerkung mit Quelle und Datum festgehalten. **Fachlich bestätigt bedeutet nicht zur Programmierung oder Geräteübertragung freigegeben.**

## Autorisiertes eigenes App-Projekt

Für die nun autorisierte Übersiedlung Ausgangsbasis, HMI-Entwurf und Nutzerdaten vollständig erhalten und von den versionierten Editor-Quellen trennen. `APP_ROOT` bezeichnet die App, `ROOT` den gewählten Workspace. Eine ausdrücklich konfigurierte lokale Quellwurzel darf nur gelesen werden; fehlt sie, bleibt Kontextfrische unbekannt statt durch einen Elternordner-Fallback vermeintlich bestätigt.

Die bisherige `.gitignore` mit `*` schließt absichtlich den ganzen Unterordner aus dem WF-Repository aus. Im neuen lokalen App-Repository wird sie durch eine passende Regel ersetzt: Editor-Kern und generische Demo versionieren, `workspaces/` vollständig ignorieren. Keine Credentials, Altanlagenoriginale, Geräte-/Buildsicherungen oder Git-Metadaten der Maschinenprojekte übernehmen. Keine GitHub-Verbindung und kein Push. [Migrationsplan und konkrete Abhängigkeiten](Migration.md) sowie `qa/migration-check.cjs` beschreiben den überprüfbaren Ablauf; Root entscheidet und setzt ihn um.

## Tatsächlicher Prüfrahmen

`qa/integration-audit.cjs` prüft lokale Hash-/Snapshot-/Zuordnungsartefakte und führt den tatsächlichen Server in einem virtuellen Dateisystem und HTTP-Ersatz aus. Dadurch werden Portabilität, Speichergrenzen und feste Routen ohne Netzwerk, Browser, OPTA oder Änderung von Nutzerdaten geprüft. Die Ergebnisdatei nennt Umfang, Warnungen und Gründe, weshalb noch kein Integrations-GO vorliegt. Interaktionen im Browser und die spätere OPTA-Integration brauchen eigene Nachweise.
