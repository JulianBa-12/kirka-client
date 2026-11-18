/* Interface language. English strings are the keys; German is a full dictionary for the
 * navigation, shared controls, settings and every 1.1 tool. Strings that are not in the
 * dictionary (for example names created by users or texts from the Polaris server) are shown
 * unchanged — the dictionary never guesses. */

const DE = {
  // navigation & destinations
  'Home': 'Start', 'Your dashboard': 'Deine Übersicht', 'Play': 'Spielen', 'Launch Kirka.io': 'Kirka.io starten',
  'Inventory': 'Inventar', 'Your local cosmetics': 'Deine lokalen Kosmetika', 'Skin Studio': 'Skin Studio', 'Pixel editor and skin library': 'Pixel-Editor und Skin-Bibliothek',
  'Backgrounds': 'Hintergründe', 'Menu backgrounds and rotation': 'Menü-Hintergründe und Rotation', 'Map Studio': 'Map Studio', 'Map library and visual presets': 'Kartenbibliothek und visuelle Presets',
  'Weapon Studio': 'Waffen-Studio', 'Weapon textures and resource swaps': 'Waffentexturen und Ressourcen-Tausch', 'Performance': 'Leistung', 'FPS, frame time, resources': 'FPS, Frametime, Ressourcen',
  'HUD Editor': 'HUD-Editor', 'Position and style HUD overlays': 'HUD-Overlays anordnen und gestalten', 'Crosshair Studio': 'Fadenkreuz-Studio', 'Custom crosshair overlay': 'Eigenes Fadenkreuz-Overlay',
  'Match Analytics': 'Match-Analyse', 'Sessions and match history': 'Sitzungen und Matchverlauf', 'Replay Studio': 'Replay-Studio', 'Recordings and bookmarks': 'Aufnahmen und Lesezeichen',
  'Social': 'Community', 'Friends, messages, groups': 'Freunde, Nachrichten, Gruppen', 'Marketplace': 'Marktplatz', 'Community cosmetics and resources': 'Kosmetika und Ressourcen der Community',
  'Plugins': 'Plugins', 'Approved extensions': 'Geprüfte Erweiterungen', 'Themes & Style': 'Themes & Stil', 'Themes and game style': 'Themes und Spielstil',
  'Visual Lab': 'Visual Lab', 'Live preview and side-by-side comparison': 'Live-Vorschau und direkter Vergleich', 'Creator Gallery': 'Creator-Galerie', 'Top community creations by type': 'Die besten Community-Werke nach Typ',
  'Session Journal': 'Sitzungstagebuch', 'Sessions, notes and personal history': 'Sitzungen, Notizen und persönlicher Verlauf', 'Profiles': 'Profile', 'Smart configuration profiles': 'Intelligente Konfigurationsprofile',
  'Workspaces': 'Arbeitsbereiche', 'Menu layout, widgets and quick access': 'Menü-Layout, Widgets und Schnellzugriff', 'Automation': 'Automatisierung', 'Local rules that switch profiles and workspaces': 'Lokale Regeln, die Profile und Arbeitsbereiche wechseln',
  'Backup Vault': 'Backup-Tresor', 'Snapshots, history and restore': 'Sicherungen, Verlauf und Wiederherstellung', 'Diagnostics': 'Diagnose', 'Checks, logs and fixes': 'Prüfungen, Protokolle und Lösungen',
  'Updates': 'Updates', 'Update Center': 'Update-Center', 'Settings': 'Einstellungen', 'Client preferences': 'Client-Einstellungen', 'Community Hub': 'Community Hub', 'News, guides and support': 'News, Anleitungen und Support',
  'Tools': 'Werkzeuge', 'Quick access': 'Schnellzugriff', 'Customization': 'Anpassung',
  // titlebar / shell
  'Shell': 'Menü', 'Game': 'Spiel', 'In match': 'Im Match', 'Preview config': 'Vorschau-Konfiguration', 'Minimize': 'Minimieren', 'Maximize': 'Maximieren', 'Close': 'Schließen',
  'Quit Polaris?': 'Polaris beenden?', 'The game session will end.': 'Die Spielsitzung wird beendet.', 'Quit': 'Beenden', 'Live': 'Live', 'Offline': 'Offline',
  'This page failed to load. ': 'Diese Seite konnte nicht geladen werden. ',
  'This feature is currently turned off by the Polaris team. It will come back automatically when it is re-enabled.': 'Diese Funktion ist vom Polaris-Team derzeit deaktiviert. Sie erscheint automatisch wieder, sobald sie aktiviert wird.',
  'Restart required': 'Neustart erforderlich', 'Restart now': 'Jetzt neu starten', 'Later': 'Später', 'Maintenance': 'Wartung', 'Dismiss': 'Ausblenden',
  // common controls
  'Save': 'Speichern', 'Cancel': 'Abbrechen', 'Delete': 'Löschen', 'Export': 'Exportieren', 'Import': 'Importieren', 'Apply': 'Anwenden', 'Reset': 'Zurücksetzen', 'OK': 'OK', 'Confirm': 'Bestätigen',
  'Start': 'Starten', 'Stop': 'Stopp', 'Edit': 'Bearbeiten', 'Rename': 'Umbenennen', 'Remove': 'Entfernen', 'Open': 'Öffnen', 'Copy': 'Kopieren', 'Create': 'Erstellen', 'Done': 'Fertig', 'Back': 'Zurück', 'Next': 'Weiter',
  'Search': 'Suchen', 'Enable': 'Aktivieren', 'Enabled': 'Aktiviert', 'Visible': 'Sichtbar', 'Show': 'Anzeigen', 'None': 'Keine', 'All': 'Alle', 'Name': 'Name', 'Upload': 'Hochladen', 'Install': 'Installieren',
  'Accept': 'Annehmen', 'Decline': 'Ablehnen', 'Clear': 'Leeren', 'Reload': 'Neu laden', 'Restart': 'Neu starten', 'Up': 'Hoch', 'Down': 'Runter', 'Beta': 'Beta', 'Off': 'Aus', 'On': 'An',
  'Open folder': 'Ordner öffnen', 'Show file': 'Datei anzeigen', 'Check now': 'Jetzt prüfen', 'Favorites': 'Favoriten', 'Featured': 'Empfohlen', 'Popular': 'Beliebt', 'Newest': 'Neueste', 'Most downloaded': 'Meiste Downloads',
  'Report': 'Melden', 'Send': 'Senden', 'Message': 'Nachricht', 'Messages': 'Nachrichten', 'Friends': 'Freunde', 'Add friend': 'Freund hinzufügen', 'Find people': 'Personen finden', 'Join': 'Beitreten', 'Leave': 'Verlassen',
  'Notifications': 'Benachrichtigungen', 'Mark all read': 'Alle als gelesen markieren', 'Post': 'Veröffentlichen', 'Profile': 'Profil', 'Avatar': 'Avatar', 'Bio': 'Über mich', 'Display name': 'Anzeigename',
  // settings
  'General': 'Allgemein', 'Appearance': 'Darstellung', 'Account': 'Konto', 'Privacy': 'Datenschutz', 'Advanced': 'Erweitert', 'Shortcuts': 'Tastenkürzel', 'Keyboard': 'Tastatur', 'Language': 'Sprache',
  'Interface language': 'Sprache der Oberfläche', 'Start on': 'Startseite', 'Start in fullscreen': 'Im Vollbild starten', 'Remember window size and position': 'Fenstergröße und -position merken',
  'Launch the game on start': 'Spiel beim Start öffnen', 'Confirm before quitting': 'Vor dem Beenden nachfragen', 'Interface animations': 'Animationen der Oberfläche', 'Decorative effects': 'Dekorative Effekte',
  'Interface scale': 'Skalierung', 'Density': 'Dichte', 'Comfortable': 'Komfortabel', 'Compact': 'Kompakt', 'Background behind pages': 'Hintergrund hinter den Seiten', 'Background in game menus': 'Hintergrund in Spielmenüs',
  'Theme': 'Theme', 'Themes': 'Themes', 'Use official theme': 'Offizielles Theme verwenden', 'Import theme': 'Theme importieren', 'Theme editor': 'Theme-Editor', 'Game style': 'Spielstil',
  'Anonymous usage statistics': 'Anonyme Nutzungsstatistik', 'Crash reports': 'Absturzberichte', 'Share online status': 'Online-Status teilen', 'Show when I am online': 'Anzeigen, wenn ich online bin',
  'Who can message me': 'Wer mir schreiben darf', 'Who can see my profile': 'Wer mein Profil sehen darf', 'Everyone': 'Alle', 'Nobody': 'Niemand', 'Only me': 'Nur ich', 'Accept friend requests': 'Freundschaftsanfragen annehmen',
  'Download my data': 'Meine Daten herunterladen', 'Delete account': 'Konto löschen', 'Delete my account': 'Mein Konto löschen', 'Two-factor authentication': 'Zwei-Faktor-Authentifizierung', 'Sign out': 'Abmelden',
  'Sign out of Kirka.io': 'Von Kirka.io abmelden', 'Cloud sync': 'Cloud-Synchronisierung', 'Upload my settings': 'Meine Einstellungen hochladen', 'Restore from account': 'Aus dem Konto wiederherstellen',
  'Test mode': 'Testmodus', 'Load preview bundle…': 'Vorschau-Paket laden…', 'Back to published configuration': 'Zurück zur veröffentlichten Konfiguration', 'Check for new configuration': 'Nach neuer Konfiguration suchen',
  'Game address': 'Spieladresse', 'Clear cache': 'Cache leeren', 'Clear game cache': 'Spiel-Cache leeren', 'Clear game data': 'Spieldaten löschen', 'Data folder': 'Datenordner', 'Logs folder': 'Protokollordner', 'Library folder': 'Bibliotheksordner',
  'Reset all settings': 'Alle Einstellungen zurücksetzen', 'Reset everything': 'Alles zurücksetzen', 'Restore default shortcuts': 'Standard-Tastenkürzel wiederherstellen', 'Show the welcome guide again': 'Einrichtung erneut anzeigen',
  'Restart Polaris': 'Polaris neu starten', 'View log': 'Protokoll anzeigen', 'Live configuration': 'Live-Konfiguration', 'Command palette shortcut': 'Tastenkürzel für die Befehlspalette',
  // performance
  'Performance Center': 'Leistungszentrum', 'Frames per second': 'Bilder pro Sekunde', 'Frame time': 'Frametime', 'Frame rate': 'Bildrate', 'Memory': 'Arbeitsspeicher', 'CPU': 'CPU', 'Processes': 'Prozesse',
  'Network latency': 'Netzwerklatenz', 'Unlock frame rate': 'Bildrate freischalten', 'Hardware acceleration': 'Hardwarebeschleunigung', 'Throttle in background': 'Im Hintergrund drosseln', 'Animated backgrounds': 'Animierte Hintergründe',
  'Run benchmark': 'Benchmark starten', 'Benchmarks': 'Benchmarks', 'Clear benchmarks': 'Benchmarks löschen', 'Open Performance Center': 'Leistungszentrum öffnen',
  // crosshair / hud / backgrounds
  'Crosshair': 'Fadenkreuz', 'Crosshairs': 'Fadenkreuze', 'Polaris crosshair': 'Polaris-Fadenkreuz', 'Hide the game’s crosshair': 'Fadenkreuz des Spiels ausblenden', 'Center dot': 'Mittelpunkt', 'Gap': 'Abstand',
  'Thickness': 'Stärke', 'Outline': 'Umriss', 'Color': 'Farbe', 'Opacity': 'Deckkraft', 'Size': 'Größe', 'Shape': 'Form', 'Rotation': 'Rotation', 'Animation': 'Animation', 'Animations': 'Animationen', 'Scale': 'Skalierung',
  'Position': 'Position', 'Anchor': 'Anker', 'Align': 'Ausrichtung', 'Font': 'Schrift', 'Border': 'Rahmen', 'Padding': 'Innenabstand', 'Corner radius': 'Eckenradius', 'Chamfer': 'Fase', 'Background': 'Hintergrund',
  'Save as preset': 'Als Preset speichern', 'Reset to preset': 'Auf Preset zurücksetzen', 'Copy code': 'Code kopieren', 'Paste code': 'Code einfügen', 'HUD': 'HUD', 'HUD layouts': 'HUD-Layouts',
  'Add images or videos': 'Bilder oder Videos hinzufügen', 'Clear queue': 'Warteschlange leeren', 'Random order': 'Zufällige Reihenfolge', 'In order': 'Der Reihe nach', 'Stop using a background': 'Keinen Hintergrund verwenden',
  'Visual filter': 'Visueller Filter', 'Brightness': 'Helligkeit', 'Contrast': 'Kontrast', 'Saturation': 'Sättigung', 'Dark': 'Dunkel', 'Light': 'Hell', 'Scene': 'Szene', 'Foliage': 'Vegetation',
  // skins / inventory / resources
  'Skins': 'Skins', 'New skin': 'Neuer Skin', 'Import PNG': 'PNG importieren', 'Export PNG': 'PNG exportieren', 'Draw': 'Zeichnen', 'Merge down': 'Nach unten zusammenführen', 'Open Skin Studio': 'Skin Studio öffnen',
  'Resources': 'Ressourcen', 'Resource swapper': 'Ressourcen-Tausch', 'Add swap': 'Tausch hinzufügen', 'Swap': 'Tauschen', 'Use as resource swap': 'Als Ressourcen-Tausch verwenden', 'Maps': 'Karten', 'Save note': 'Notiz speichern',
  'Upload to marketplace': 'Im Marktplatz veröffentlichen', 'Browse marketplace': 'Marktplatz durchsuchen', 'My uploads': 'Meine Uploads', 'Install from file': 'Aus Datei installieren',
  // analytics / replays
  'Analytics': 'Analyse', 'Sessions': 'Sitzungen', 'Match log': 'Matchprotokoll', 'Log a match': 'Match eintragen', 'Export CSV': 'CSV exportieren', 'Results': 'Ergebnisse', 'Win': 'Sieg', 'Loss': 'Niederlage', 'Not recorded': 'Nicht erfasst',
  'Replays': 'Replays', 'Start recording': 'Aufnahme starten', 'Stop recording': 'Aufnahme beenden', 'Bookmarks': 'Lesezeichen', 'Bookmark here': 'Hier Lesezeichen setzen', 'Create clip': 'Clip erstellen', 'Export a clip': 'Clip exportieren',
  'Set start': 'Start setzen', 'Set end': 'Ende setzen', 'Codec': 'Codec', 'Bitrate': 'Bitrate', 'Stop automatically after': 'Automatisch stoppen nach', 'Screenshots': 'Screenshots',
  // profiles / updates
  'Smart Profiles': 'Smart Profiles', 'Save current setup': 'Aktuelles Setup speichern', 'Save profile': 'Profil speichern', 'Create from current': 'Aus aktuellem Setup erstellen',
  'Channel': 'Kanal', 'Stable': 'Stabil', 'Check automatically': 'Automatisch prüfen', 'Download automatically': 'Automatisch herunterladen', 'Restore previous version': 'Vorherige Version wiederherstellen', 'Roll back': 'Zurückrollen', 'Open Update Center': 'Update-Center öffnen',
  // command center
  'Command Center': 'Command Center', 'Search features, settings and actions': 'Funktionen, Einstellungen und Aktionen suchen', 'Frequently used': 'Häufig verwendet', 'No matching commands': 'Keine passenden Befehle',
  'Go to': 'Öffnen', 'Action': 'Aktion', 'Setting': 'Einstellung', 'Assign shortcut': 'Tastenkürzel zuweisen', 'Press a key combination': 'Tastenkombination drücken', 'Remove shortcut': 'Tastenkürzel entfernen',
  'Command shortcuts': 'Befehls-Tastenkürzel', 'Commands with your own shortcut. Shortcuts only work inside the Polaris window, never globally and never in the game.': 'Befehle mit eigenem Tastenkürzel. Kürzel wirken nur im Polaris-Fenster, nie systemweit und nie im Spiel.',
  // smart setup
  'Smart Setup': 'Smart Setup', 'Welcome to Polaris': 'Willkommen bei Polaris', 'Recommendations': 'Empfehlungen', 'Your system': 'Dein System', 'Finish': 'Abschließen', 'Skip setup': 'Einrichtung überspringen',
  'Keep current': 'Beibehalten', 'Use recommendation': 'Empfehlung übernehmen', 'Import existing settings': 'Bestehende Einstellungen importieren', 'Import from file': 'Aus Datei importieren',
  'What Polaris does not do': 'Was Polaris nicht tut',
  // workspace
  'New workspace': 'Neuer Arbeitsbereich', 'Save current layout': 'Aktuelles Layout speichern', 'Activate': 'Aktivieren', 'Active': 'Aktiv', 'Menu order': 'Menü-Reihenfolge', 'Hidden': 'Ausgeblendet',
  'Linked profile': 'Verknüpftes Profil', 'No profile': 'Kein Profil', 'Save to library': 'In Bibliothek speichern', 'Current layout': 'Aktuelles Layout', 'Show in menu': 'Im Menü anzeigen', 'Tools group open': 'Werkzeuge ausgeklappt',
  // journal
  'Note': 'Notiz', 'Tags': 'Tags', 'Rating': 'Bewertung', 'Favorite': 'Favorit', 'Only favorites': 'Nur Favoriten', 'Export journal': 'Tagebuch exportieren', 'Current session': 'Aktuelle Sitzung', 'No sessions yet': 'Noch keine Sitzungen',
  // automation
  'New rule': 'Neue Regel', 'When': 'Wenn', 'Then': 'Dann', 'Test': 'Testen', 'Run log': 'Ausführungsprotokoll', 'Rules': 'Regeln', 'Polaris starts': 'Polaris startet', 'The game has loaded': 'Das Spiel ist geladen',
  'A match starts': 'Ein Match beginnt', 'A match ends': 'Ein Match endet', 'Running on battery': 'Akkubetrieb', 'Connected to power': 'Am Netzteil', 'Display narrower than 1600 px': 'Bildschirm schmaler als 1600 px',
  'Display 1600 px or wider': 'Bildschirm 1600 px oder breiter', 'Every day at': 'Täglich um', 'Apply profile': 'Profil anwenden', 'Apply performance preset': 'Leistungs-Preset anwenden', 'Activate workspace': 'Arbeitsbereich aktivieren', 'Show a notice': 'Hinweis anzeigen',
  // backups
  'Create backup': 'Sicherung erstellen', 'Restore': 'Wiederherstellen', 'Intact': 'Intakt', 'Damaged': 'Beschädigt', 'Automatic daily backup': 'Tägliche automatische Sicherung', 'Keep automatic backups': 'Automatische Sicherungen behalten',
  'Import backup': 'Sicherung importieren', 'Restore selected': 'Auswahl wiederherstellen', 'Manual': 'Manuell', 'Automatic': 'Automatisch', 'Before restore': 'Vor Wiederherstellung',
  // diagnostics
  'Run checks': 'Prüfung starten', 'Export report': 'Bericht exportieren', 'Copy report': 'Bericht kopieren', 'Network': 'Netzwerk', 'Configuration': 'Konfiguration', 'System': 'System', 'Storage': 'Speicher', 'Logs': 'Protokolle',
  'Reconnect': 'Neu verbinden',
  // home
  'Good morning': 'Guten Morgen', 'Good afternoon': 'Guten Tag', 'Good evening': 'Guten Abend', 'Late session': 'Späte Runde', 'Welcome back': 'Willkommen zurück',
  'Quick launch': 'Schnellstart', 'Session statistics': 'Sitzungsstatistik', 'Recent matches': 'Letzte Matches', 'Favorite skins': 'Lieblings-Skins', 'Announcements': 'Ankündigungen',
  'Community news': 'Community-News', 'Customize home': 'Startseite anpassen', 'Play Kirka.io': 'Kirka.io spielen', 'Return to game': 'Zurück zum Spiel',
  'Sessions': 'Sitzungen', 'In matches': 'In Matches', 'Matches': 'Matches', 'Avg fps': 'Ø FPS', 'last 7 days': 'letzte 7 Tage', 'measured time': 'gemessene Zeit', 'entered': 'betreten',
  'during matches': 'während Matches', 'No announcements.': 'Keine Ankündigungen.', 'No skins yet.': 'Noch keine Skins.', 'Open Skin Studio': 'Skin Studio öffnen', 'Open Analytics': 'Analyse öffnen',
  'Performance Center': 'Leistungszentrum', 'Replays': 'Replays', 'Up to date': 'Aktuell', 'Greeting': 'Begrüßung', 'Updates available': 'Updates verfügbar',
  // titlebar & shell
  'Toggle game': 'Spiel umschalten', 'Quick access': 'Schnellzugriff', 'Minimize': 'Minimieren', 'Maximize': 'Maximieren', 'Restore': 'Wiederherstellen', 'Close': 'Schließen',
  'Live': 'Live', 'Offline': 'Offline', 'In match': 'Im Match', 'Shell': 'Shell', 'Game': 'Spiel', 'Tools': 'Werkzeuge', 'Restart now': 'Jetzt neu starten', 'Restart required.': 'Neustart erforderlich.',
  'Maintenance.': 'Wartung.', 'Open Update Center': 'Update-Center öffnen', 'is available.': 'ist verfügbar.', 'Edit quick access': 'Schnellzugriff bearbeiten', 'No shortcuts pinned yet.': 'Noch keine Verknüpfungen angeheftet.',
  // command center
  'Go to': 'Gehe zu', 'Actions': 'Aktionen', 'Frequently used': 'Häufig verwendet', 'No matching command': 'Kein passender Befehl', 'select': 'auswählen', 'run': 'ausführen', 'assign shortcut': 'Tastenkürzel zuweisen', 'close': 'schließen',
  'Assign shortcut': 'Tastenkürzel zuweisen', 'Press the key combination for': 'Drücke die Tastenkombination für', 'needs a modifier': 'braucht Strg, Alt oder Umschalt', 'already used by Polaris': 'wird von Polaris bereits verwendet',
  'Use a modifier (Ctrl, Alt or Shift) or a function key. Esc cancels, Backspace removes the shortcut.': 'Nutze Strg, Alt oder Umschalt oder eine Funktionstaste. Esc bricht ab, Rücktaste entfernt das Kürzel.',
  'Language': 'Sprache', 'Start page': 'Startseite', 'Confirm before quitting': 'Vor dem Beenden fragen', 'Theme and UI scale': 'Theme und UI-Skalierung', 'Shell background': 'Shell-Hintergrund', 'FPS unlock': 'FPS-Freischaltung',
  'Hardware acceleration': 'Hardwarebeschleunigung', 'Background throttling': 'Hintergrund-Drosselung', 'Keybinds': 'Tastenbelegung', 'Game CSS': 'Spiel-CSS', 'Usage statistics': 'Nutzungsstatistik', 'Delete my data': 'Meine Daten löschen',
  'Server and account': 'Server und Konto', 'Realtime connection': 'Echtzeitverbindung', 'Logs': 'Protokolle', 'Command palette key': 'Taste für die Befehlspalette', 'Reset Polaris': 'Polaris zurücksetzen',
  // smart setup
  'Smart Setup': 'Smart Setup', 'Welcome': 'Willkommen', 'Your system': 'Dein System', 'Import': 'Import', 'Finish': 'Fertig', 'Back': 'Zurück', 'Continue': 'Weiter', 'Skip setup': 'Einrichtung überspringen',
  'Accept': 'Annehmen', 'Decline': 'Ablehnen', 'Declined': 'Abgelehnt', 'restart': 'Neustart', 'restart if declined': 'Neustart bei Ablehnung', 'Setup complete': 'Einrichtung abgeschlossen', 'Reading system information…': 'Systeminformationen werden gelesen…',
  'Polaris is a desktop client for Kirka.io. It loads the official game and adds a custom crosshair, HUD overlays, local cosmetics, recording and performance tools around it.': 'Polaris ist ein Desktop-Client für Kirka.io. Er lädt das offizielle Spiel und ergänzt ein eigenes Fadenkreuz, HUD-Overlays, lokale Kosmetika, Aufnahme- und Leistungswerkzeuge.',
  'What Polaris does not do': 'Was Polaris nicht tut',
  'No cheats, aimbots, wallhacks or automation. Polaris does not read game memory, change hitboxes or touch your Kirka account, inventory or KC. Skins you create here are local cosmetics.': 'Keine Cheats, Aimbots, Wallhacks oder Automatisierung. Polaris liest keinen Spielspeicher, ändert keine Hitboxen und greift nicht auf dein Kirka-Konto, Inventar oder KC zu. Hier erstellte Skins sind lokale Kosmetika.',
  'Usage statistics and crash reports are off. You can opt in under Settings → Privacy.': 'Nutzungsstatistik und Absturzberichte sind aus. Du kannst sie unter Einstellungen → Datenschutz aktivieren.',
  'Recommendations based on this machine. Accept or decline each one — nothing changes until you press Finish.': 'Empfehlungen für diesen Rechner. Nimm jede an oder lehne sie ab — nichts ändert sich, bevor du auf „Fertig“ drückst.',
  'Coming from another installation? Import a Polaris settings export or a Backup Vault file. Otherwise continue.': 'Du kommst von einer anderen Installation? Importiere einen Polaris-Einstellungsexport oder eine Backup-Tresor-Datei. Sonst einfach weiter.',
  'Import settings export': 'Einstellungsexport importieren', 'Import backup file': 'Backup-Datei importieren', 'Settings imported': 'Einstellungen importiert', 'Ready. These changes will be applied:': 'Bereit. Diese Änderungen werden übernommen:',
  'opens the Command Center from anywhere — search any page, action or setting.': 'öffnet überall das Command Center — suche jede Seite, Aktion oder Einstellung.',
  'Some choices take effect after a restart (Settings → Advanced → Restart).': 'Einige Änderungen wirken erst nach einem Neustart (Einstellungen → Erweitert → Neustart).',
  'Use the “Performance” profile': '„Leistung“-Profil verwenden', 'Keep the “Balanced” profile': '„Ausgewogen“-Profil beibehalten', 'Unlock the frame rate': 'Bildrate freischalten', 'Keep hardware acceleration on': 'Hardwarebeschleunigung eingeschaltet lassen',
  'Larger interface (110 %)': 'Größere Oberfläche (110 %)', 'Compact density': 'Kompakte Darstellung', 'Daily automatic backups': 'Tägliche automatische Backups', 'Receive live updates from the Polaris server': 'Live-Updates vom Polaris-Server empfangen',
  // lab / gallery
  'Compare': 'Vergleichen', 'Variant A': 'Variante A', 'Variant B': 'Variante B', 'Use A': 'A übernehmen', 'Use B': 'B übernehmen', 'Swap A and B': 'A und B tauschen',
  'Top rated': 'Am besten bewertet', 'Most favorited': 'Meiste Favoriten', 'Workspace layouts': 'Arbeitsbereich-Layouts',
};

let lang = 'en';
export function setLanguage(l) { lang = l === 'de' ? 'de' : 'en'; document.documentElement.lang = lang; }
export const language = () => lang;
export function t(s) {
  if (lang === 'en' || typeof s !== 'string') return s;
  const hit = DE[s];
  if (hit) return hit;
  // keep surrounding whitespace/punctuation ("Save " / "Settings →")
  const m = s.match(/^(\s*)(.*?)(\s*[:→…]?\s*)$/);
  return m && m[2] && DE[m[2]] ? m[1] + DE[m[2]] + m[3] : s;
}
export const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }];
export const dictionarySize = () => Object.keys(DE).length;
