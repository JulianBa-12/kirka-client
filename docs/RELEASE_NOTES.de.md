# Polaris Client 1.1.0

Polaris 1.1 bringt ein Command Center, eine geführte Einrichtung, Workspaces und Werkzeuge, mit denen du dein Setup vergleichen, dokumentieren und sichern kannst. Dazu kommen Live-Updates von einem Polaris-Server und eine deutsche Oberfläche. Polaris ist ein unabhängiger Client und steht in keiner Verbindung zu Kirka.io.

## Downloads

| Datei | Für |
| --- | --- |
| `Polaris-Client-1.1.0.AppImage` | Jede x86-64-Linux-Distribution. Ausführbar machen und starten. |
| `Polaris-Client-1.1.0.deb` | Debian, Ubuntu und Derivate. |

Jede Datei steht mit Größe und SHA-512 im signierten Release-Manifest und auf der [Download-Seite](https://julianba-12.github.io/kirka-client/downloads.html). SHA-256-Prüfsummen stehen in `SHA256SUMS.txt` im GitHub-Release.

## Update von 1.0.0: ein manueller Schritt

Der Signaturschlüssel für Releases wurde ausgetauscht (neue Schlüssel-ID `d3d1bf42ccbcdfe3`). Polaris 1.0.0 vertraut nur dem alten Schlüssel. Das Update Center meldet deshalb, dass es das **Release-Manifest nicht verifizieren kann**. So soll es sein, denn genau das schützt dich. Lade 1.1.0 einmal von Hand herunter, über die Download-Seite oder GitHub Releases. Einstellungen und Bibliothek bleiben erhalten. Ab 1.1.0 werden Updates wieder automatisch geprüft.

## Neu

- **Command Center.** Strg+K öffnet es überall, auch während das Spiel den Fokus hat. Es durchsucht alle Seiten, Aktionen, Einstellungen, Workspaces und Profile. Häufig genutzte Befehle stehen weiter oben. Mit Alt+Enter bekommt ein Befehl ein eigenes Tastenkürzel. Das Schnellzugriffsmenü in der Titelleiste enthält deine meistgenutzten Befehle.
- **Smart Setup.** Ein kurzer Einrichtungsassistent beim ersten Start: Sprache, Empfehlungen passend zu deinem System, Import von Einstellungen oder einem Backup. Du nimmst jede Empfehlung einzeln an oder lehnst sie ab. Vor dem Abschluss ändert sich nichts.
- **Workspaces.** Speichern Menüreihenfolge, ausgeblendete Seiten, Startseiten-Widgets, Schnellzugriff und optional ein verknüpftes Profil. Ein Wechsel wirkt sofort.
- **Visual Lab.** Zwei visuelle Setups (Fadenkreuz, Farbfilter, Hintergrund) nebeneinander vergleichen und direkt im laufenden Spiel ausprobieren.
- **Session Journal.** Jede gemessene Session mit Notizen, Tags, Bewertung und Favoriten. Die Zahlen stammen ausschließlich aus der Polaris-eigenen Messung. Es werden keine Matchergebnisse erfunden.
- **Profil-Automatisierung.** Lokale „Wenn … dann …“-Regeln, z. B. „Wenn ein Match startet, wechsle zum Profil Competitive“. Regeln ändern nur Polaris-Einstellungen oder zeigen einen Hinweis. Sie senden niemals Eingaben an das Spiel.
- **Backup Vault.** Automatische und manuelle Snapshots aller Polaris-Daten, jeweils mit SHA-256-Prüfung. Export, Import und Wiederherstellung sind möglich. Vor jeder Wiederherstellung legt Polaris einen Sicherheits-Snapshot an. Beschädigte Backups lassen sich nicht wiederherstellen.
- **Diagnose.** Echte Prüfungen von GPU, Speicher, Speicherplatz, Datenordner, Netzwerk, Konfigurationssignatur, Live-Updates und letzten Fehlern. Zu jeder Prüfung gibt es Messwert und Lösungsvorschlag. Der Bericht lässt sich für Bug-Reports kopieren oder exportieren.
- **Creator Gallery.** Skins, Hintergründe, Fadenkreuze, HUD-Layouts, Themes, Workspaces und Ressourcen aus der Community. Bewerten mit 1–5 Sternen, Favoriten, Melden, Installation mit einem Klick und Teilen aus der eigenen Bibliothek.
- **Live-Updates.** Ist ein Polaris-Server eingetragen, kommen veröffentlichte Änderungen innerhalb von Sekunden an: Konfiguration, Ankündigungen, Wartungshinweise und persönliche Benachrichtigungen. Braucht eine Änderung einen Neustart, sagt Polaris Bescheid.
- **Deutsch.** Die Oberfläche gibt es jetzt auf Deutsch, umstellbar unter Einstellungen → Allgemein oder im Smart Setup.

## Bekannte Einschränkungen

- Live-Updates, Creator Gallery, Bewertungen, Marktplatz, soziale Funktionen und Cloud-Sync brauchen einen Polaris-Server (Einstellungen → Konto). Ohne Server prüft Polaris alle 30 Minuten den signierten Konfigurations-Mirror auf GitHub Pages.
- Die deutsche Übersetzung deckt die Oberflächentexte ab. Einige dynamische Meldungen (Serverfehler, Diagnosedetails) sind noch englisch.
- Eigene Tastenkürzel funktionieren in der Polaris-Oberfläche. Hat das Spiel den Fokus, werden nur Strg+K und F1 abgefangen.
- Kirka.io hat keine öffentliche API für Statistiken, Inventar, Replays oder Skins, und Polaris tut auch nicht so, als gäbe es eine.
- Die Latenz ist die HTTPS-Antwortzeit von kirka.io, nicht der Ping zum Spielserver. Bildschirmaufnahmen unter Linux enthalten kein Spiel-Audio.

## Fair Play

Polaris enthält keine Cheats, Aimbots, Wallhacks, Eingabe-Automatisierung oder Anti-Cheat-Umgehungen. Polaris liest keinen Spielspeicher und verändert keine Spieldaten.
