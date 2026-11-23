# HMI-Draft · Integrationsvertrag

Der Entwurf ist vom Live-Projekt getrennt. Eine automatische Produktionsübernahme ist ausdrücklich nicht vorgesehen.

## Gesicherte Grundlage

`baseline/manifest.json` hält Quellversion und SHA-256 des tatsächlichen Ausgangsdokuments fest. Das im Manifest benannte Original-Quelldokument unter `baseline/` bleibt unverändert. Die aktuelle Live-HMI darf während der späteren Integration nicht stillschweigend als identische Grundlage angenommen werden: zuerst Hash beziehungsweise zwischenzeitliche Änderungen abgleichen.

## Arbeits- und Übergabedaten

`data/draft.json` ist das maschinenlesbare Entwurfsprotokoll, Schema 1. Es enthält Seitenkennungen und sichtbare Namen, einzelne Gestaltungsschritte mit Elementschlüssel, ursprünglichen Bezug, Kommentare und Status. Sichtbare Bezeichnungen werden getrennt von technischen IDs, `data-cmd` und internen Seitenkennungen geführt.

Zusätzliche konkrete Entwurfsänderungen stehen in `hmi.html`. Vor deren Änderung eine lokale Dateikopie sichern. Für eine Freigabe eindeutige Momentaufnahme mit Entwurfsdaten und dem zugehörigen HTML-/Quellhash anlegen; danach keine stillen Änderungen an dieser Momentaufnahme.

Jedes Feedback wird auf tiefergehende Programmfolgen geprüft. Solche Folgen werden vorab erklärt und einzeln bestätigt. Bestätigte zusätzliche Funktionsanforderungen mit Quelle und Bestätigungsdatum getrennt von Layoutänderungen in das Übergabepaket aufnehmen; ungeklärte oder unbestätigte Punkte ausdrücklich offen lassen. Bestätigt bedeutet fachlich vorgemerkt, nicht zur Programmierung oder Geräteübertragung freigegeben.

## Paket erst nach ausdrücklicher Freigabe

1. Freigabestand und Nutzerfreigabe eindeutig benennen; Ausgangs- und Entwurfshashes, Seiten und Screenshots festhalten.
2. Freigegebene Änderungen gegen die tatsächliche aktuelle Hauptchat-HMI abgleichen. Offene Kommentare und unaufgelöste Elementbezüge gesondert ausweisen.
3. Minimale Änderungen an der produktiven Darstellung vorbereiten. Werkstatt, Kommentarmodus, Beispieldaten, Node-Server und lokale Dateipfade nicht übernehmen.
4. Neue Seiten beziehungsweise duplizierte Bedienelemente auf nötige echte Befehlsbindungen prüfen. Ein Layout-Duplikat ist keine neue freigegebene Maschinenfunktion.
5. Bedienrechte, Befehlskennungen, Betriebsarten-/Stopplogik, Force, Fehlermeldungen, echte/angenommene Zustände und Netzwerkvorgaben als unveränderte Schnittstellen nachweisen, soweit nicht separat ausdrücklich geändert.
6. Betroffene HMI- und Bedienprüfungen, Darstellungsprüfungen im Hochformat und erforderliche Ressourcen-/Buildprüfungen im Hauptchat durchführen. Abweichende Grundlagen oder nicht auflösbare Bezüge blockieren die automatische Übernahme.
7. Erst das konkret freigegebene Integrationspaket in Git aufnehmen. Firmwareübertragung und reale Erprobung bleiben eigene autorisierte Hauptchat-Schritte mit Rückfallsicherung.

Dieser Vertrag bereitet eine nachvollziehbare Übernahme vor. Er ersetzt weder die spätere technische Prüfung noch eine Implementierungs- oder Gerätefreigabe.
