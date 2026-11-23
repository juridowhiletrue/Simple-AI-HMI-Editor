# Weitergabe des Simple-AI-HMI-Editors

Das öffentliche Repository enthält den Werkzeugkern, den Skill und eine anonymisierte Automation als Demo. Die Demo hat einen lokalen Testadapter und neutrale Beispieldaten. Dateinamen, Logos, Kunden-/Firmenkennungen, persönliche Pfade und reale Netzwerkadressen gehören bei neuen Beispielen in die Prüfung vor einem Commit.

Echte HMI-Projekte liegen unter `workspaces/`. Auch Kommentare, Baselines, Exporte, Programmkontext und persönliche Konfiguration bleiben Git-ignoriert. Eine vollständige private Sicherung ist separat verschlüsselt im zugehörigen privaten Anlagenrepository abgelegt. Der Schlüssel liegt separat auf dem Projekt-PC. Beim Teilen von Sicherungen deren Inhalt und Wiederherstellungsschlüssel getrennt behandeln.

Die öffentliche Git-Historie beginnt mit dem bereinigten Werkzeugstand. Die vorherige lokale Geschichte ist in der privaten Sicherung erhalten.

GitHub ermöglicht anderen Personen das Lesen und Klonen des öffentlichen Repositorys. Änderungen am Ursprungsrepository benötigen Schreibrechte des Eigentümers. Eine Open-Source-Lizenz ist noch vom Eigentümer auszuwählen.

`llms.txt`, die README, Repository-Themen und der installierbare Skill erleichtern den Einstieg für KI-Agenten. Eine Aufnahme durch Suchmaschinen oder in das Training bzw. globale Wissen eines KI-Anbieters ist davon abhängig, ob dessen Systeme den Inhalt abrufen und verwenden.
