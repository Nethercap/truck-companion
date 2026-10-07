// Guia de uso: de, fr, pt, pl, tr, ru. Se carga despues de text.js; lo que
// falte cae al ingles. Los nombres siguen los de la app en cada idioma.

GUIDE_TEXT.de = {
  title: 'Anleitung',
  lead: 'Alles, was Truck Dash kann, Bildschirm für Bildschirm. Truck Dash ist ein kostenloses Navi und Armaturenbrett für Euro Truck Simulator 2 und American Truck Simulator, auf dem Handy, einem Tablet oder einem zweiten Monitor. Kein Konto nötig.',
  openApp: 'App öffnen',
  demo: 'Demo ausprobieren',
  toc: 'Inhalt',
  backTop: 'Nach oben',
  privacy: 'Datenschutz',
  support: 'Unterstützen',
  h: {
    start: 'Erste Schritte',
    status: 'Die Statusanzeige',
    gps: 'Das Navi',
    panel: 'Das Infopanel',
    dash: 'Das Armaturenbrett',
    buttons: 'Das Lkw-Tastenfeld',
    settings: 'Einstellungen und die obere Leiste',
    convoy: 'Konvoi (Beta)',
    client: 'Der Client auf deinem PC',
    account: 'Dein Konto (optional)',
  },
  legend: { gps: 'Kartenschaltflächen', settings: 'Obere Leiste' },
  cap: {
    map: 'Querformat: die Karte mit der Route, das Infopanel und das Tastenfeld.',
    phone: 'Navigationsmodus auf dem Handy.',
    dash: 'Das Armaturenbrett im Vollbild.',
  },
  b: {
    start: `
<ol>
<li>Lade den Client von <a href="/">trucksim-dash.com</a> herunter und starte <code>TruckDash.exe</code> auf dem PC, auf dem du spielst. Er sitzt im Infobereich der Taskleiste, neben der Uhr.</li>
<li>Rechtsklick auf das Symbol, <b>Einrichtung &amp; Status</b> öffnen und bei deinem Spiel auf <b>Plugin installieren</b> klicken. War das Spiel offen, starte es neu.</li>
<li>Öffne auf dem Handy <a href="/app/">trucksim-dash.com/app</a> und gib den <b>Pairing-Code</b> ein, den der Client anzeigt. Das Handy muss nicht im selben WLAN sein.</li>
</ol>
<p>Der Code läuft nach 10 Minuten ab, wenn ihn niemand benutzt. Einmal verbunden, bleibt die Sitzung aktiv, bis du den Client beendest.</p>
<h3>Gleiches WLAN: geringste Latenz</h3>
<p>Einrichtung &amp; Status zeigt auch eine lokale Adresse und einen QR-Code. Scanne ihn mit dem Handy und du bist drin: ohne Pairing-Code, und es läuft weiter, auch wenn das Internet ausfällt. Windows fragt einmal, ob es durch die Firewall darf.</p>
<div class="tip"><p>Nutze im Handy-Browser <b>Zum Startbildschirm hinzufügen</b>: Dann öffnet sich Truck Dash im Vollbild, wie eine App.</p></div>
<p>Kein Spiel zur Hand? Die <a href="/app/?demo=1">Demo</a> fährt eine Tour auf der echten ATS-Karte.</p>`,
    status: `
<p>Die Anzeige oben links in der App sagt dir bei jedem Schritt, was los ist:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Client läuft nicht</b>: Starte TruckDash.exe auf deinem PC oder sieh nach seinem Symbol in der Taskleiste.</span></li>
<li><span class="dot"></span><span><b>Warte auf das Spiel</b>: Der Client ist verbunden; öffne ETS2 oder ATS.</span></li>
<li><span class="dot bad"></span><span><b>Plugin nicht installiert</b>: Das Spiel läuft, sendet aber keine Daten. Einrichtung &amp; Status, Plugin installieren, dann das Spiel neu starten.</span></li>
<li><span class="dot"></span><span><b>Im Menü</b>: Steig in den Lkw und die Daten kommen.</span></li>
<li><span class="dot ok"></span><span><b>Live</b>: alles in Ordnung. Bei pausiertem Spiel steht dort <b>Pausiert</b>.</span></li>
<li><span class="dot bad"></span><span><b>Ungültiger oder abgelaufener Code</b>: Hol dir einen neuen über das Symbol in der Taskleiste, <b>Pairing-Code anzeigen</b>.</span></li>
</ul>`,
    gps: `
<p>Die Route zum Ziel deines Auftrags wird <b>automatisch</b> gezeichnet, sobald du einen Auftrag annimmst: Schnellaufträge und Frachtmarkt, auch die Autoaufträge aus Road Trip: Ford (Client 1.5.21 oder neuer). Sie folgt deiner Wahl in den Einstellungen: die schnellste, wie das Navi im Spiel, oder die kürzeste.</p>
<p>Die <b>Routenübersicht</b> unten auf der Karte zeigt Reststrecke, Restzeit und Ankunftszeit mit einem Fortschrittsbalken. Der Pfeil verkleinert sie zu einem schmalen Fortschrittsbalken (antippen, um sie wieder zu öffnen), und der Knopf mit der durchgestrichenen Route entfernt die Route von der Karte.</p>
<h3>Navigationsmodus</h3>
<p>Die Karte dreht sich mit deiner Fahrtrichtung, zoomt vor Abzweigungen heran und zeigt oben Anweisungen wie <i>Rechts halten auf I-15 Richtung Provo</i>. Wie nah sie dir folgt, stellst du in den Einstellungen ein. Mit zwei Fingern zoomen geht trotzdem; der Zentrieren-Knopf holt dich zurück.</p>
<h3>Wegpunkte</h3>
<p>Tippe auf die Fahne und dann auf eine Stelle der Karte, bis zu 9 Stopps. Die App fragt, ob du den Punkt auch im Navi des Spiels gesetzt hast:</p>
<ul>
<li><b>Ja</b>: Die ETA des Spiels rechnet den Umweg schon mit, die App zeichnet nur die Route dorthin.</li>
<li><b>Nein</b>: Die App berechnet eigene Strecke und Zeit über den Punkt und zeigt sie als <i>über Wegpunkt</i> unter den ETAs.</li>
</ul>
<h3>In der Nähe suchen</h3>
<p>Die Lupe findet Tankstellen, Rastplätze, Werkstätten, Garagen, Lkw-Händler und Waagen in deiner Nähe, oder jede Firma und Stadt. Tippe auf ein Ergebnis und die Route führt dort vorbei. <b>Nächste Tankstelle</b> ist ein einziger Tipp.</p>
<h3>Außerdem auf der Karte</h3>
<ul>
<li>Die <b>blaue Linie</b> hinter dem Lkw zeigt, wo du gefahren bist.</li>
<li>Mit <b>Meine Position teilen</b> siehst du andere Truck-Dash-Fahrer auf deiner Karte und erscheinst anonym auf der öffentlichen <a href="/live/">Live-Karte</a>, mit deiner Route, außer du deaktivierst <b>Auch meine Route auf der Live-Karte zeigen</b>. Abschalten kannst du das in den Einstellungen.</li>
<li><b>Karten-Mods</b> haben eigene Karten: ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia und TruckersMP. Die App erkennt sie im Spiel, oder du wählst sie mit dem Puzzle-Knopf.</li>
<li><b>DLCs</b> (in den Einstellungen): Entferne den Haken bei Karten-DLCs, die du nicht besitzt, dann meiden Routen ihre Straßen. Gibt es keinen Umweg, nutzt die Route sie trotzdem und sagt es dir. Ab Client 1.5.28 werden sie automatisch aus deinem Spiel gelesen.</li>
</ul>
<p>Alle Kartenschaltflächen lassen sich verschieben und in der Größe ändern: auf dem Handy lange drücken, oder in den Einstellungen <b>Schaltflächen verschieben</b>.</p>`,
    panel: `
<p>Im Querformat neben der Karte, auf dem Handy im Hochformat darunter (seitlich wischen für weitere Seiten).</p>
<h3>Reiter Daten</h3>
<ul>
<li>Geschwindigkeit, Tempolimit, Straßennummer und Tempomat-Geschwindigkeit.</li>
<li>Tankinhalt, Reichweite und Durchschnittsverbrauch, gemessen an deiner eigenen Fahrt, sobald du 15 km gefahren bist (bis dahin der Wert des Spiels).</li>
<li><b>Fahrt</b>: Start und Ziel, Ladung, ETA in Spielzeit, <b>ETA (real)</b> in echten Minuten, nächste Stadt, Spielzeit, Auftragsfrist, nächste Ruhepause mit deiner Müdigkeit und Auftragslohn. Der Lohn kann auch in deiner Währung angezeigt werden.</li>
<li><b>Lkw</b>: Modell, Kilometerstand, Verschleiß jedes Teils und Warnungen wie niedriger Luftdruck, hohe Wasser- oder Öltemperatur und schwache Batterie.</li>
<li><b>Sitzung</b>: bezahlte Maut, Strafen und Fähr- oder Zugfahrten, mit einem Zurücksetzen-Knopf.</li>
</ul>
<h3>Reiter Anzeigen</h3>
<p>Tacho, Drehzahlmesser mit Gang, Tankbalken, Kilometerstand und Reichweite.</p>
<h3>Mini-HUD</h3>
<p>Blende das Panel mit dem Knopf mit den drei Strichen aus und die Karte füllt den ganzen Bildschirm; Geschwindigkeit und Tempolimit bleiben in einer Ecke. In den Einstellungen wählst du, was das Mini-HUD noch zeigt: Tank, Reichweite, ETA, Reststrecke, nächste Ruhepause mit Müdigkeit, Tempomat und Navi-Anweisungen.</p>`,
    dash: `
<p>Der Tacho-Knopf in der oberen Leiste öffnet ein Armaturenbrett im Vollbild:</p>
<ul>
<li>Ein Routenbalken, der markiert, wo du eine Pause brauchst.</li>
<li>Zu früh oder zu spät gegenüber der Auftragsfrist, und Lohn pro km.</li>
<li>Ob der Sprit bis zum Ziel reicht, und AdBlue.</li>
<li>Schaden jedes Teils von Lkw und Anhänger, und Ladungsschaden.</li>
<li>Öl-, Wasser- und Bremsentemperatur, Luft- und Öldruck, Batteriespannung.</li>
<li>Kontrollleuchten: Scheinwerfer, Blinker, Warnblinker, Rundumleuchte, Scheibenwischer, Motorbremse, Retarder, Differenzialsperre, Handbremse, Liftachse und Anhänger.</li>
<li>Summen der Sitzung: gefahrene Strecke, Zeit am Steuer, Durchschnitts- und Höchstgeschwindigkeit, verbrauchter Kraftstoff und Nettoeinnahmen.</li>
</ul>
<p>S, M und L ändern die Größe; das X führt zurück zur Karte.</p>
<h3>Auf einem zweiten Bildschirm</h3>
<p>Öffne <a href="/dash/">trucksim-dash.com/dash</a> auf einem anderen Gerät (Tablet, altes Handy, zweiter Monitor) und gib denselben Pairing-Code ein. Navi und Armaturenbrett können gleichzeitig laufen. In den Einstellungen gibt es den Knopf <b>Link zum Armaturenbrett kopieren</b>.</p>`,
    buttons: `
<p>Der Gamepad-Knopf auf der Karte öffnet eine Reihe von Lkw-Befehlen. Tippe auf einen und der Client auf deinem PC drückt die Taste im Spiel für dich.</p>`,
    settings: `
<p>Das Zahnrad öffnet die Einstellungen:</p>
<ul>
<li><b>Einheiten</b> (km oder Meilen) und <b>Sprache</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: was angezeigt wird, wenn das Infopanel ausgeblendet ist.</li>
<li><b>Andere Fahrer in der Nähe</b>: deine Position teilen, oder die Markierungen der anderen ausblenden.</li>
<li><b>Kartenschaltflächen</b>: dunkler Stil passend zur Karte, beim Fahren ausblenden (sie kommen bei Berührung zurück), und <b>Schaltflächen verschieben</b>: jeden Knopf oder jedes Panel ziehen, an der Ecke die Größe ändern, mit Raster und Zurücksetzen.</li>
<li><b>Echte Basiskarte</b>: Küsten, Seen, Flüsse und bebaute Flächen unter den Straßen (etwa 1 MB mehr).</li>
<li><b>Sparmodus</b> für alte Handys und Tablets: leichtere Darstellung und auf Wunsch ganz ohne Routenberechnung, um am meisten Speicher zu sparen.</li>
<li><b>Routenpräferenz</b>: schnellste oder kürzeste.</li>
<li><b>Auftragslohn in deiner Währung</b>, neben den € oder $ des Spiels.</li>
<li><b>Farbe der Routenlinie</b>: Rot, Blau oder Grün.</li>
<li><b>Kartenzoom im Navigationsmodus</b>.</li>
<li><b>Sprachansagen</b>: im Navigationsmodus wird jede Abbiegung vorher und an der Abbiegung angesagt, dazu die Ankunft, ohne Straßennamen.</li>
<li><b>Tasten belegen</b> für das Tastenfeld.</li>
<li><b>Armaturenbrett auf einem anderen Gerät</b>: den Link kopieren.</li>
<li><b>Fahrtenverlauf</b>: deine Lieferungen, nur auf diesem Gerät gespeichert.</li>
<li><b>Problem melden</b>, die Roadmap und das Changelog.</li>
</ul>
<p>Auf einem schmalen Handy wandern einige Knöpfe der oberen Leiste in die Einstellungen.</p>
<div class="tip"><p>Jede Lieferung wird auch im Kanal <b>#jobs</b> auf unserem <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> gepostet: Route, Lkw, Ladung, Strecke und Lohn, ohne Namen und ohne Konto.</p></div>`,
    convoy: `
<p>Fahr mit Freunden und seht euch gegenseitig auf der Karte. Jeder nutzt sein eigenes Spiel und seinen Client: Ihr müsst nicht in derselben Multiplayer-Sitzung sein.</p>
<ul>
<li>Öffne den Konvoi-Knopf in der oberen Leiste, wähle einen Spitznamen und <b>Konvoi erstellen</b>, oder gib den 6-stelligen Code eines Freundes ein und <b>Beitreten</b>. Mit <b>Link kopieren</b> teilst du ihn auf Discord.</li>
<li>Die Mitglieder erscheinen auf der Karte und in einer Reihe von Karten: wie weit sie von dir weg sind, ihre Fahrt und ihr Lohn, falls sie ihn teilen.</li>
<li><b>Anführer folgen</b>, und <b>Route zeigen</b>, um zu sehen, wohin jemand fährt.</li>
<li><b>Kurznachrichten</b> von der Karte aus: Alles gut, Halt am nächsten Rastplatz, Brauche Sprit, Falle zurück, Wartet auf mich, Los geht's.</li>
<li>Freunde ohne Spiel können den Link öffnen und zuschauen.</li>
<li>Auf Wunsch wird am Ende eine Zusammenfassung im Truck-Dash-Discord gepostet. Danach wird nichts gespeichert.</li>
</ul>
<p>Der Konvoi braucht die Internetverbindung (trucksim-dash.com/app mit deinem Pairing-Code), nicht die Adresse im gleichen WLAN.</p>`,
    client: `
<p>Rechtsklick auf das Symbol in der Taskleiste, neben der Uhr:</p>
<ul>
<li><b>Einrichtung &amp; Status</b>: der Pairing-Code, die Adresse fürs gleiche WLAN mit QR-Code, das Plugin für jedes Spiel (Steam-Installationen werden selbst gefunden; <b>Spielordner hinzufügen</b> für den Rest) und die Optionen.</li>
<li><b>Optionen</b>: mit Windows starten (öffnet das Armaturenbrett, wenn das Spiel startet), deine Tour im Discord-Profil zeigen, Truck Dash schließen, wenn das Spiel beendet wird, und das Armaturenbrett beim Start im Browser öffnen.</li>
<li><b>Pairing-Code anzeigen</b>, und <b>Trennen</b>, das dir einen neuen Code gibt.</li>
<li><b>Nach Updates suchen</b>. Client und App melden sich auch, wenn eine neue Version da ist.</li>
<li><b>Logdatei anzeigen</b> und <b>Problem melden</b>.</li>
</ul>
<div class="tip"><p>Klappt etwas nicht? Frag auf unserem <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> und häng die Logdatei an: Die meisten Probleme sind in ein paar Nachrichten gelöst.</p></div>`,
    account: `
<p>Ein Konto speichert deinen Fahrtverlauf: jeden Auftrag, den du fährst, mit seiner Route auf einer Karte. Es ist optional und kostenlos, und alles andere in Truck Dash funktioniert auch ohne.</p>
<ol>
<li>Melde dich auf <a href="/account/">trucksim-dash.com/account</a> mit Discord, Google oder einer E-Mail und einem Passwort an. Bei E-Mail schicken wir dir einen 6-stelligen Code zur Bestätigung.</li>
<li>Öffne im Client <b>Einrichtung &amp; Status</b> und klicke auf <b>Konto verknüpfen</b>. Im Browser öffnet sich eine Seite: bestätigen, und der Client ist verknüpft.</li>
</ol>
<p>Ab dann wird jeder Auftrag beim Abliefern oder Stornieren gespeichert: die Route nach Geschwindigkeit eingefärbt, die Strecke (die des Spiels und die gemessene), Lohn, Kraftstoff, Maut, Bußgelder, Schaden, Fahrzeit und Schlafstunden, pünktlich oder verspätet, und die Länder oder Staaten, durch die du gefahren bist. In deinem Konto findest du das Fahrtenbuch (mit CSV-Export), Statistiken pro Spiel, Rekorde und Erfolge. <b>Mein Konto</b> im Tray-Menü bringt dich dorthin.</p>
<h3>Gut zu wissen</h3>
<ul>
<li>Gespeichert wird erst, wenn du den Client verknüpfst. Dein Profil ist privat, außer du machst es in den <b>Einstellungen</b> öffentlich.</li>
<li>Unter <b>Folge ich</b> kannst du anderen Fahrern über ihren Benutzernamen folgen. Sie müssen zustimmen, und wen du annimmst, sieht deine Fahrten mit Route, wo du gerade fährst und deine Erfolge, auch wenn dein Profil privat ist. Deine Notizen bleiben deine.</li>
<li>Lieferst du einen Auftrag bei geschlossenem Truck Dash ab, sehen wir die Lieferung nicht und die Fahrt gilt als <b>unvollständig</b>. Du kannst sie als storniert markieren, aber eine Lieferung kann nur das Spiel melden.</li>
<li>Eine Weile kein Internet? Nichts geht verloren: Der Client behält die Fahrt und schickt sie, sobald du wieder online bist.</li>
<li>Aufträge mit einem Geld-Mod werden markiert und nicht zu deinen Geldsummen gezählt.</li>
<li>In den <b>Einstellungen</b> kannst du alle deine Daten herunterladen oder dein Konto löschen.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Ein Knopf wird <b>blau</b>, wenn das im Lkw an ist (Motor läuft, Licht an, Anhänger angekuppelt, Tempomat gesetzt), so dient die Reihe auch als Statusanzeige.</p>
<h3>Deine Tasten</h3>
<p>Die Knöpfe haben voreingestellte Tasten. Wenn du die Steuerung im Spiel geändert hast, gleiche sie in den Einstellungen an, <b>Tasten belegen</b>. Lass eine Taste leer, um den Knopf abzuschalten.</p>
<h3>Eigene Knöpfe</h3>
<p><b>Button hinzufügen</b> legt bis zu 3 eigene an: Gib eine Beschriftung ein und drücke die Taste (Kombinationen mit Strg, Umschalt und Alt gehen, ebenso F1 bis F24 und der Ziffernblock). Belege dann dieselbe Taste in der Steuerung des Spiels mit was du willst: Differenzialsperre, Retarder, Hupe, das Radio.</p>
<div class="tip"><p>Auf dem Handy im Hochformat ist das Tastenfeld eine weitere Seite des Infopanels: einfach hinwischen. Der Client muss laufen und das Spiel offen sein; in der Demo tun die Knöpfe nichts.</p></div>`,
  },
  ic: {
    recenterBtn: ['Zentrieren', 'Zurück zu deinem Lkw und zu deinem Navi-Zoom.'],
    fullscreenBtn: ['Vollbild', 'Blendet die obere Leiste und die Leisten des Handys aus.'],
    navToggleBtn: ['Navigationsmodus', 'Die Karte dreht sich mit, zoomt an Abzweigungen und zeigt Anweisungen.'],
    tilt3dBtn: ['3D-Ansicht', 'Geneigte Ansicht, im Navigationsmodus.'],
    waypointBtn: ['Wegpunkt', 'Antippen, dann auf die Karte tippen. Bis zu 9.'],
    commandsToggleBtn: ['Lkw-Tastenfeld', 'Lkw-Befehle: Licht, Motor, Warnblinker und mehr.'],
    convoyMsgBtn: ['Konvoi-Nachricht', 'Kurznachrichten, solange du in einem Konvoi bist.'],
    panelToggleBtn: ['Infopanel', 'Ein- oder ausblenden; ausgeblendet übernimmt das Mini-HUD.'],
    poiBtn: ['In der Nähe suchen', 'Tankstellen, Rastplätze, Werkstätten, Firmen und mehr.'],
    dashBtn: ['Armaturenbrett', 'Instrumente im Vollbild.'],
    settingsBtn: ['Einstellungen', 'Alles aus der Liste oben.'],
    helpBtn: ['Kurze Tour', 'Zeigt die geführte Tour noch einmal.'],
    unitToggle: ['Einheiten', 'Kilometer oder Meilen.'],
    langSelect: ['Sprache', 'Acht Sprachen.'],
    modsBtn: ['Karten-Mods', 'Im Spiel erkannt oder von Hand gewählt.'],
    convoyBtn: ['Konvoi', 'Mit Freunden fahren.'],
    discordBtn: ['Discord', 'Die Community: Hilfe, Ideen und #jobs.'],
  },
  cmd: {
    cmdHazards: 'Warnblinker', cmdBeacon: 'Rundumleuchte', cmdHandbrake: 'Handbremse', cmdEngine: 'Motor',
    cmdTrailer: 'Anhänger', cmdCamera: 'Kamera', cmdCruise: 'Tempomat', cmdLights: 'Licht',
    cmdHighBeam: 'Fernlicht', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Liftachse', cmdWipers: 'Scheibenwischer',
    add: 'Button hinzufügen',
  },
};

GUIDE_TEXT.fr = {
  title: "Guide d'utilisation",
  lead: "Tout ce que fait Truck Dash, écran par écran. Truck Dash est un GPS et un tableau de bord gratuits pour Euro Truck Simulator 2 et American Truck Simulator, sur ton téléphone, une tablette ou un second écran. Aucun compte nécessaire.",
  openApp: "Ouvrir l'appli",
  demo: 'Essayer la démo',
  toc: 'Sommaire',
  backTop: 'Haut de page',
  privacy: 'Confidentialité',
  support: 'Soutenir',
  h: {
    start: 'Pour commencer',
    status: "L'indicateur d'état",
    gps: 'Le GPS',
    panel: "Le panneau d'infos",
    dash: 'Le tableau de bord',
    buttons: 'La boîte à boutons',
    settings: 'Paramètres et barre du haut',
    convoy: 'Convoi (bêta)',
    client: 'Le client sur ton PC',
    account: 'Votre compte (facultatif)',
  },
  legend: { gps: 'Boutons de la carte', settings: 'Barre du haut' },
  cap: {
    map: "En paysage : la carte avec l'itinéraire, le panneau d'infos et la boîte à boutons.",
    phone: 'Le mode navigation sur un téléphone.',
    dash: 'Le tableau de bord en plein écran.',
  },
  b: {
    start: `
<ol>
<li>Télécharge le client sur <a href="/">trucksim-dash.com</a> et lance <code>TruckDash.exe</code> sur le PC où tu joues. Il se loge dans la zone de notification, à côté de l'horloge.</li>
<li>Clic droit sur l'icône, ouvre <b>Configuration et état</b> et clique sur <b>Installer le plugin</b> pour ton jeu. Si le jeu était ouvert, redémarre-le.</li>
<li>Sur ton téléphone, ouvre <a href="/app/">trucksim-dash.com/app</a> et tape le <b>code d'appairage</b> affiché par le client. Le téléphone n'a pas besoin d'être sur le même Wi-Fi.</li>
</ol>
<p>Le code expire au bout de 10 minutes s'il n'est pas utilisé. Une fois connecté, la session dure jusqu'à ce que tu quittes le client.</p>
<h3>Même Wi-Fi : latence minimale</h3>
<p>Configuration et état affiche aussi une adresse locale et un QR code. Scanne-le avec le téléphone et c'est parti : pas de code d'appairage, et ça continue de marcher même si internet coupe. Windows demande une fois l'autorisation dans le pare-feu.</p>
<div class="tip"><p>Dans le navigateur du téléphone, utilise <b>Ajouter à l'écran d'accueil</b> : Truck Dash s'ouvre alors en plein écran, comme une appli.</p></div>
<p>Pas de jeu sous la main ? La <a href="/app/?demo=1">démo</a> joue un trajet sur la vraie carte d'ATS.</p>`,
    status: `
<p>L'indicateur en haut à gauche de l'appli te dit où tu en es à chaque étape :</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Client non lancé</b> : lance TruckDash.exe sur ton PC, ou regarde son icône dans la zone de notification.</span></li>
<li><span class="dot"></span><span><b>En attente du jeu</b> : le client est connecté ; ouvre ETS2 ou ATS.</span></li>
<li><span class="dot bad"></span><span><b>Plugin non installé</b> : le jeu tourne mais n'envoie rien. Configuration et état, Installer le plugin, puis redémarre le jeu.</span></li>
<li><span class="dot"></span><span><b>Dans le menu</b> : monte dans le camion et les données arrivent.</span></li>
<li><span class="dot ok"></span><span><b>En direct</b> : tout va bien. Il affiche <b>En pause</b> quand le jeu est en pause.</span></li>
<li><span class="dot bad"></span><span><b>Code invalide ou expiré</b> : prends-en un nouveau depuis l'icône, <b>Afficher le code d'appairage</b>.</span></li>
</ul>`,
    gps: `
<p>L'itinéraire vers la destination de ta livraison se trace <b>tout seul</b> dès que tu prends un contrat : contrats rapides et marché du fret, y compris les livraisons de voitures de Road Trip: Ford (client 1.5.21 ou plus récent). Il suit ta préférence dans les Paramètres : le plus rapide, comme le GPS du jeu, ou le plus court.</p>
<p>Le <b>résumé de l'itinéraire</b>, en bas de la carte, affiche la distance et le temps restants et l'heure d'arrivée, avec une barre de progression. La flèche le réduit à une fine barre de progression (touche-la pour le rouvrir), et le bouton à l'itinéraire barré efface l'itinéraire de la carte.</p>
<h3>Mode navigation</h3>
<p>La carte tourne avec ton cap, zoome avant les virages et affiche les indications en haut, par exemple <i>Serrez à droite sur I-15 vers Provo</i>. Tu choisis dans les Paramètres à quelle distance elle te suit. Tu peux toujours zoomer avec deux doigts ; le bouton recentrer te ramène.</p>
<h3>Points de passage</h3>
<p>Touche le drapeau puis un endroit de la carte, jusqu'à 9 arrêts. L'appli demande si tu as aussi placé ce point dans le GPS du jeu :</p>
<ul>
<li><b>Oui</b> : l'ETA du jeu compte déjà le détour, l'appli dessine seulement l'itinéraire qui y passe.</li>
<li><b>Non</b> : l'appli calcule sa propre distance et son propre temps via ce point, affichés comme <i>via point de passage</i> sous les ETA.</li>
</ul>
<h3>Chercher à proximité</h3>
<p>La loupe trouve les stations-service, aires de repos, ateliers, garages, concessionnaires et stations de pesage autour de toi, ou n'importe quelle entreprise ou ville. Touche un résultat et l'itinéraire y passe. <b>Station-service la plus proche</b> tient en un seul geste.</p>
<h3>Aussi sur la carte</h3>
<ul>
<li>La <b>ligne bleue</b> derrière le camion montre là où tu es passé.</li>
<li>Avec <b>Partager ma position</b> activé, tu vois les autres conducteurs Truck Dash sur ta carte et tu apparais de façon anonyme sur la <a href="/live/">carte en direct</a> publique, avec ton itinéraire, sauf si tu décoches <b>Afficher aussi mon itinéraire sur la carte en direct</b>. Ça se désactive dans les Paramètres.</li>
<li>Les <b>mods de carte</b> ont leur propre carte : ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia et TruckersMP. L'appli les détecte depuis le jeu, ou tu en choisis un avec le bouton puzzle.</li>
<li><b>DLC</b> (dans les Paramètres) : décochez les DLC de carte que vous n’avez pas et les itinéraires évitent leurs routes. S’il n’y a pas d’autre chemin, l’itinéraire les emprunte quand même et le signale. Avec le client 1.5.28 ou plus récent, ils sont lus automatiquement depuis votre jeu.</li>
</ul>
<p>Chaque bouton de la carte peut être déplacé et redimensionné : appui long sur téléphone, ou <b>Déplacer les boutons</b> dans les Paramètres.</p>`,
    panel: `
<p>À côté de la carte en paysage, en dessous sur un téléphone tenu droit (fais glisser sur le côté pour les autres pages).</p>
<h3>Onglet Données</h3>
<ul>
<li>Vitesse, limitation, numéro de route et vitesse du régulateur.</li>
<li>Carburant, autonomie et consommation moyenne, mesurée sur ta propre conduite dès que tu as fait 15 km (avant, le chiffre du jeu).</li>
<li><b>Trajet</b> : départ et arrivée, cargaison, ETA en temps de jeu, <b>ETA réelle</b> en vraies minutes, prochaine ville, heure du jeu, échéance du contrat, prochaine pause avec ta fatigue et paie. La paie peut aussi s'afficher dans ta devise.</li>
<li><b>Camion</b> : modèle, compteur kilométrique, usure de chaque pièce et alertes comme pression d'air basse, eau ou huile trop chaudes et batterie faible.</li>
<li><b>Session</b> : péages, amendes et trajets en ferry ou en train, avec un bouton Réinitialiser.</li>
</ul>
<h3>Onglet Cadrans</h3>
<p>Compteur de vitesse, compte-tours avec le rapport engagé, jauge de carburant, compteur kilométrique et autonomie.</p>
<h3>Mini-HUD</h3>
<p>Masque le panneau avec le bouton à trois traits et la carte prend tout l'écran ; ta vitesse et la limitation restent dans un coin. Dans les Paramètres tu choisis ce que le mini-HUD affiche en plus : carburant, autonomie, ETA, distance restante, prochaine pause avec la fatigue, régulateur et indications du GPS.</p>`,
    dash: `
<p>Le bouton compteur de la barre du haut ouvre un tableau de bord en plein écran :</p>
<ul>
<li>Une barre d'itinéraire qui indique où tu devras te reposer.</li>
<li>En avance ou en retard sur l'échéance, et la paie au km.</li>
<li>Si ton carburant suffit jusqu'à destination, et l'AdBlue.</li>
<li>Les dégâts de chaque pièce du camion et de la remorque, et ceux de la cargaison.</li>
<li>Températures d'huile, d'eau et de freins, pression d'air et d'huile, tension de la batterie.</li>
<li>Voyants : phares, clignotants, feux de détresse, gyrophare, essuie-glaces, frein moteur, ralentisseur, blocage du différentiel, frein à main, essieu relevable et remorque.</li>
<li>Totaux de la session : distance parcourue, temps au volant, vitesse moyenne et maximale, carburant consommé et revenu net.</li>
</ul>
<p>S, M et L changent la taille ; la croix revient à la carte.</p>
<h3>Sur un second écran</h3>
<p>Ouvre <a href="/dash/">trucksim-dash.com/dash</a> sur un autre appareil (tablette, vieux téléphone, second écran) et tape le même code d'appairage. Le GPS et le tableau de bord peuvent tourner en même temps. Les Paramètres ont un bouton <b>Copier le lien du tableau de bord</b>.</p>`,
    buttons: `
<p>Le bouton manette sur la carte ouvre une rangée de commandes du camion. Touche-en une et le client sur ton PC appuie sur la touche dans le jeu à ta place.</p>`,
    settings: `
<p>L'engrenage ouvre les Paramètres :</p>
<ul>
<li><b>Unités</b> (km ou miles) et <b>langue</b> : English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b> : quoi afficher quand le panneau d'infos est masqué.</li>
<li><b>Autres conducteurs à proximité</b> : partager ta position, ou masquer les marqueurs des autres.</li>
<li><b>Boutons de la carte</b> : style sombre assorti à la carte, les estomper pendant la conduite (ils reviennent au toucher), et <b>Déplacer les boutons</b> : fais glisser n'importe quel bouton ou panneau, et son coin pour le redimensionner, avec une grille et un Réinitialiser.</li>
<li><b>Vrai fond de carte</b> : côtes, lacs, rivières et zones bâties sous les routes (environ 1 Mo de plus).</li>
<li><b>Mode léger</b> pour les vieux téléphones et tablettes : rendu allégé et, si besoin, sans calcul d'itinéraire pour économiser le plus de mémoire.</li>
<li><b>Préférence d'itinéraire</b> : le plus rapide ou le plus court.</li>
<li><b>Paie dans ta devise</b>, à côté des € ou $ du jeu.</li>
<li><b>Couleur de l'itinéraire</b> : rouge, bleu ou vert.</li>
<li><b>Zoom de la carte en mode navigation</b>.</li>
<li><b>Guidage vocal</b> : en mode navigation, annonce chaque virage à l’avance puis au virage, ainsi que l’arrivée, sans noms de routes.</li>
<li><b>Réassigner les touches</b> de la boîte à boutons.</li>
<li><b>Tableau de bord sur un autre appareil</b> : copier son lien.</li>
<li><b>Historique des trajets</b> : tes livraisons, enregistrées uniquement sur cet appareil.</li>
<li><b>Signaler un problème</b>, la feuille de route et le journal des versions.</li>
</ul>
<p>Sur un téléphone étroit, certains boutons de la barre du haut passent dans les Paramètres.</p>
<div class="tip"><p>Chaque livraison est aussi publiée dans le salon <b>#jobs</b> de notre <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> : trajet, camion, cargaison, distance et paie, sans nom ni compte.</p></div>`,
    convoy: `
<p>Roule avec tes amis et voyez-vous sur la carte. Chacun utilise son propre jeu et son client : pas besoin d'être dans la même session multijoueur.</p>
<ul>
<li>Ouvre le bouton convoi dans la barre du haut, choisis un pseudo et <b>Créer un convoi</b>, ou tape le code à 6 caractères d'un ami et <b>Rejoindre</b>. <b>Copier le lien</b> pour le coller sur Discord.</li>
<li>Les membres apparaissent sur la carte et dans une rangée de cartes : leur distance, leur trajet et leur paie s'ils choisissent de la partager.</li>
<li><b>Suivre le chef</b>, et <b>Voir l'itinéraire</b> pour savoir où va chacun.</li>
<li><b>Messages rapides</b> depuis la carte : Tout va bien, Arrêt à la prochaine aire, Besoin de carburant, Je prends du retard, Attendez-moi, C'est parti.</li>
<li>Les amis sans le jeu peuvent ouvrir le lien et regarder.</li>
<li>Si tu veux, un résumé est publié sur le Discord de Truck Dash à la fin du convoi. Rien n'est gardé ensuite.</li>
</ul>
<p>Le convoi a besoin de la connexion par internet (trucksim-dash.com/app avec ton code), pas de l'adresse du même Wi-Fi.</p>`,
    client: `
<p>Clic droit sur l'icône de la zone de notification, à côté de l'horloge :</p>
<ul>
<li><b>Configuration et état</b> : le code d'appairage, l'adresse pour le même Wi-Fi avec son QR code, le plugin de chaque jeu (les installations Steam sont trouvées toutes seules ; <b>Ajouter le dossier du jeu</b> pour les autres) et les options.</li>
<li><b>Options</b> : lancer avec Windows (ouvre le tableau de bord au démarrage du jeu), afficher ton trajet sur ton profil Discord, fermer Truck Dash quand le jeu se ferme, et ouvrir le tableau de bord dans le navigateur au démarrage.</li>
<li><b>Afficher le code d'appairage</b>, et <b>Déconnecter</b>, qui te donne un nouveau code.</li>
<li><b>Rechercher des mises à jour</b>. Le client et l'appli te préviennent aussi quand une nouvelle version sort.</li>
<li><b>Voir le fichier journal</b> et <b>Signaler un problème</b>.</li>
</ul>
<div class="tip"><p>Quelque chose ne marche pas ? Demande sur notre <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> en joignant le fichier journal : la plupart des problèmes se règlent en quelques messages.</p></div>`,
    account: `
<p>Un compte garde votre historique de conduite : chaque mission que vous faites, avec son itinéraire sur une carte. Il est facultatif et gratuit, et tout le reste de Truck Dash fonctionne pareil sans compte.</p>
<ol>
<li>Connectez-vous sur <a href="/account/">trucksim-dash.com/account</a> avec Discord, Google, ou un e-mail et un mot de passe. Avec un e-mail, nous vous envoyons un code à 6 chiffres pour le confirmer.</li>
<li>Dans le client, ouvrez <b>Configuration et état</b> et cliquez sur <b>Lier un compte</b>. Une page s'ouvre dans le navigateur : confirmez, et le client est lié.</li>
</ol>
<p>Dès lors, chaque mission est enregistrée à la livraison ou à l'annulation : l'itinéraire coloré selon la vitesse, la distance (celle du jeu et celle mesurée), la paie, le carburant, les péages, les amendes, les dégâts, le temps de conduite et les heures de sommeil, à l'heure ou en retard, et les pays ou États traversés. Votre compte contient le carnet de route (avec export CSV), des statistiques par jeu, des records et des succès. <b>Mon compte</b>, dans le menu de la zone de notification, vous y mène.</p>
<h3>Bon à savoir</h3>
<ul>
<li>Rien n'est enregistré avant de lier le client. Votre profil est privé, sauf si vous le rendez public dans les <b>Paramètres</b>.</li>
<li>Dans <b>Abonnements</b>, vous pouvez suivre d’autres conducteurs par leur nom d’utilisateur. Il faut leur accord, et les personnes que vous acceptez voient vos trajets avec leur itinéraire, où vous êtes quand vous conduisez et vos succès, même si votre profil est privé. Vos notes restent à vous.</li>
<li>Si vous livrez une mission avec Truck Dash fermé, nous ne voyons pas la livraison et le trajet apparaît comme <b>inachevé</b>. Vous pouvez le marquer comme annulé, mais seul le jeu peut signaler une livraison.</li>
<li>Pas d'internet pendant un moment ? Rien n'est perdu : le client garde le trajet et l'envoie dès que vous êtes de nouveau en ligne.</li>
<li>Les missions avec un mod d'argent sont marquées et exclues de vos totaux d'argent.</li>
<li>Dans les <b>Paramètres</b>, vous pouvez télécharger toutes vos données ou supprimer votre compte.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Un bouton devient <b>bleu</b> quand la fonction est active sur ton camion (moteur allumé, phares, remorque attelée, régulateur enclenché) : la rangée sert aussi de tableau d'état.</p>
<h3>Tes touches</h3>
<p>Les boutons ont des touches par défaut. Si tu as changé les commandes dans le jeu, fais pareil dans les Paramètres, <b>Réassigner les touches</b>. Laisse une touche vide pour désactiver ce bouton.</p>
<h3>Boutons perso</h3>
<p><b>Ajouter un bouton</b> en crée jusqu'à 3 : donne-lui un nom et appuie sur la touche (les combinaisons avec Ctrl, Maj et Alt marchent, ainsi que F1 à F24 et le pavé numérique). Assigne ensuite cette même touche à ce que tu veux dans les commandes du jeu : blocage du différentiel, ralentisseur, klaxon, la radio.</p>
<div class="tip"><p>Sur un téléphone tenu droit, la boîte à boutons est une page de plus du panneau d'infos : fais glisser jusqu'à elle. Le client doit tourner avec le jeu ouvert ; dans la démo, les boutons ne font rien.</p></div>`,
  },
  ic: {
    recenterBtn: ['Recentrer', 'Revient sur ton camion et sur ton zoom de navigation.'],
    fullscreenBtn: ['Plein écran', 'Masque la barre du haut et celles du téléphone.'],
    navToggleBtn: ['Mode navigation', 'La carte tourne avec toi, zoome dans les virages et donne les indications.'],
    tilt3dBtn: ['Vue 3D', 'Vue inclinée, en mode navigation.'],
    waypointBtn: ['Point de passage', 'Touche-le, puis touche la carte. Jusqu’à 9.'],
    commandsToggleBtn: ['Boîte à boutons', 'Commandes du camion : phares, moteur, détresse et plus.'],
    convoyMsgBtn: ['Message au convoi', 'Messages rapides, quand tu es dans un convoi.'],
    panelToggleBtn: ["Panneau d'infos", "L'affiche ou le masque ; masqué, le mini-HUD prend le relais."],
    poiBtn: ['Chercher à proximité', 'Carburant, aires de repos, ateliers, entreprises et plus.'],
    dashBtn: ['Tableau de bord', 'Instruments en plein écran.'],
    settingsBtn: ['Paramètres', 'Tout ce qui est dans la liste ci-dessus.'],
    helpBtn: ['Visite rapide', 'Rejoue la visite guidée de l’écran.'],
    unitToggle: ['Unités', 'Kilomètres ou miles.'],
    langSelect: ['Langue', 'Huit langues.'],
    modsBtn: ['Mods de carte', 'Détectés depuis le jeu, ou choisis à la main.'],
    convoyBtn: ['Convoi', 'Rouler avec des amis.'],
    discordBtn: ['Discord', 'La communauté : aide, idées et #jobs.'],
  },
  cmd: {
    cmdHazards: 'Détresse', cmdBeacon: 'Gyrophare', cmdHandbrake: 'Frein à main', cmdEngine: 'Moteur',
    cmdTrailer: 'Remorque', cmdCamera: 'Caméra', cmdCruise: 'Régulateur', cmdLights: 'Phares',
    cmdHighBeam: 'Pleins phares', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Essieu relevable', cmdWipers: 'Essuie-glaces',
    add: 'Ajouter un bouton',
  },
};

GUIDE_TEXT.pt = {
  title: 'Guia de uso',
  lead: 'Tudo o que o Truck Dash faz, tela por tela. O Truck Dash é um GPS e painel grátis para Euro Truck Simulator 2 e American Truck Simulator, no celular, num tablet ou num segundo monitor. Não precisa de conta.',
  openApp: 'Abrir o app',
  demo: 'Testar a demo',
  toc: 'Conteúdo',
  backTop: 'Voltar ao topo',
  privacy: 'Privacidade',
  support: 'Apoiar',
  h: {
    start: 'Primeiros passos',
    status: 'O indicador de status',
    gps: 'O GPS',
    panel: 'O painel de informações',
    dash: 'O painel de instrumentos',
    buttons: 'A botoeira',
    settings: 'Configurações e a barra de cima',
    convoy: 'Comboio (beta)',
    client: 'O cliente no seu PC',
    account: 'Sua conta (opcional)',
  },
  legend: { gps: 'Botões do mapa', settings: 'Barra de cima' },
  cap: {
    map: 'Na horizontal: o mapa com a rota, o painel de informações e a botoeira.',
    phone: 'Modo navegação no celular.',
    dash: 'O painel de instrumentos em tela cheia.',
  },
  b: {
    start: `
<ol>
<li>Baixe o cliente em <a href="/">trucksim-dash.com</a> e abra o <code>TruckDash.exe</code> no PC onde você joga. Ele fica na bandeja do sistema, ao lado do relógio.</li>
<li>Clique com o botão direito no ícone, abra <b>Configuração e status</b> e clique em <b>Instalar plugin</b> no seu jogo. Se o jogo estava aberto, reinicie.</li>
<li>No celular, abra <a href="/app/">trucksim-dash.com/app</a> e digite o <b>código de pareamento</b> que o cliente mostra. O celular não precisa estar na mesma Wi-Fi.</li>
</ol>
<p>O código expira depois de 10 minutos se ninguém usar. Depois de conectado, a sessão dura até você fechar o cliente.</p>
<h3>Mesma Wi-Fi: a menor latência</h3>
<p>Configuração e status também mostra um endereço local e um QR code. Escaneie com o celular e pronto: sem código de pareamento, e continua funcionando mesmo se a internet cair. O Windows pergunta uma vez se pode liberar no firewall.</p>
<div class="tip"><p>No navegador do celular use <b>Adicionar à tela inicial</b>: o Truck Dash passa a abrir em tela cheia, como um app.</p></div>
<p>Sem o jogo por perto? A <a href="/app/?demo=1">demo</a> faz uma viagem no mapa real do ATS.</p>`,
    status: `
<p>O indicador no canto superior esquerdo do app diz o que está acontecendo em cada passo:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Cliente não está rodando</b>: abra o TruckDash.exe no PC, ou veja o ícone dele na bandeja.</span></li>
<li><span class="dot"></span><span><b>Esperando o jogo</b>: o cliente está conectado; abra o ETS2 ou o ATS.</span></li>
<li><span class="dot bad"></span><span><b>Plugin não instalado</b>: o jogo está aberto mas não manda dados. Configuração e status, Instalar plugin, e reinicie o jogo.</span></li>
<li><span class="dot"></span><span><b>No menu</b>: entre no caminhão e os dados começam a chegar.</span></li>
<li><span class="dot ok"></span><span><b>Ao vivo</b>: tudo certo. Mostra <b>Pausado</b> enquanto o jogo está pausado.</span></li>
<li><span class="dot bad"></span><span><b>Código inválido ou expirado</b>: pegue um novo no ícone da bandeja, <b>Mostrar código de pareamento</b>.</span></li>
</ul>`,
    gps: `
<p>A rota até o destino do frete é desenhada <b>sozinha</b> assim que você pega um frete: fretes rápidos e mercado de fretes, incluindo os fretes de carro do Road Trip: Ford (cliente 1.5.21 ou mais novo). Ela segue a sua preferência nas Configurações: a mais rápida, como o GPS do jogo, ou a mais curta.</p>
<p>O <b>resumo da rota</b>, embaixo do mapa, mostra a distância e o tempo que faltam e a hora de chegada, com uma barra de progresso. A seta reduz ele a uma barrinha de progresso (toque nela para abrir de novo), e o botão da rota riscada apaga a rota do mapa.</p>
<h3>Modo navegação</h3>
<p>O mapa gira com a sua direção, aproxima antes das curvas e mostra as instruções no alto, como <i>Mantenha-se à direita na I-15 sentido Provo</i>. Nas Configurações você escolhe o quão perto ele te acompanha. Dá para dar zoom com os dedos; o botão de centralizar te traz de volta.</p>
<h3>Waypoints</h3>
<p>Toque na bandeira e depois num ponto do mapa, até 9 paradas. O app pergunta se você também marcou esse ponto no GPS do jogo:</p>
<ul>
<li><b>Sim</b>: o ETA do jogo já conta o desvio, então o app só desenha a rota passando por ali.</li>
<li><b>Não</b>: o app calcula a própria distância e tempo passando pelo ponto, mostrados como <i>via waypoint</i> embaixo dos ETAs.</li>
</ul>
<h3>Buscar por perto</h3>
<p>A lupa encontra postos, áreas de descanso, oficinas, garagens, concessionárias e balanças perto de você, ou qualquer empresa ou cidade. Toque num resultado e a rota passa por ali. <b>Posto mais próximo</b> é um toque só.</p>
<h3>Também no mapa</h3>
<ul>
<li>A <b>linha azul</b> atrás do caminhão mostra por onde você passou.</li>
<li>Com <b>Compartilhar minha posição</b> ligado, você vê outros motoristas do Truck Dash no seu mapa e aparece como motorista anônimo no <a href="/live/">mapa ao vivo</a> público, com a sua rota, a menos que desmarque <b>Mostrar também minha rota no mapa ao vivo</b>. Dá para desligar nas Configurações.</li>
<li>Os <b>mods de mapa</b> têm mapa próprio: ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia e TruckersMP. O app detecta pelo jogo, ou você escolhe com o botão do quebra-cabeça.</li>
<li><b>DLCs</b> (em Configurações): desmarque os DLCs de mapa que você não tem e as rotas evitam as estradas deles. Se não houver como contornar, a rota usa mesmo assim e avisa. Com o cliente 1.5.28 ou mais novo, eles são lidos do seu jogo sozinhos.</li>
</ul>
<p>Todos os botões do mapa podem ser movidos e redimensionados: segure um no celular, ou use <b>Mover os botões</b> nas Configurações.</p>`,
    panel: `
<p>Ao lado do mapa na horizontal, embaixo dele no celular em pé (deslize para o lado para ver mais páginas).</p>
<h3>Aba Dados</h3>
<ul>
<li>Velocidade, limite, número da rodovia e velocidade do piloto automático.</li>
<li>Combustível, autonomia e consumo médio, medido com a sua direção depois de 15 km (até lá, o valor do jogo).</li>
<li><b>Viagem</b>: origem e destino, carga, ETA no jogo, <b>ETA real</b> em minutos de verdade, próxima cidade, hora do jogo, prazo do frete, próximo descanso com sua fadiga e pagamento. O pagamento também pode aparecer na sua moeda.</li>
<li><b>Caminhão</b>: modelo, hodômetro, desgaste de cada peça e alertas como pressão de ar baixa, água ou óleo quentes demais e bateria fraca.</li>
<li><b>Sessão</b>: pedágios, multas e viagens de balsa ou trem, com um botão para zerar.</li>
</ul>
<h3>Aba Painel</h3>
<p>Velocímetro, conta-giros com a marcha, barra de combustível, hodômetro e autonomia.</p>
<h3>Mini-HUD</h3>
<p>Esconda o painel com o botão de três linhas e o mapa ocupa a tela toda; a velocidade e o limite ficam num canto. Nas Configurações você escolhe o que mais o mini-HUD mostra: combustível, autonomia, ETA, distância restante, próximo descanso com a fadiga, piloto automático e instruções do GPS.</p>`,
    dash: `
<p>O botão de velocímetro na barra de cima abre um painel de instrumentos em tela cheia:</p>
<ul>
<li>Uma barra da rota que marca onde você vai precisar descansar.</li>
<li>Adiantado ou atrasado em relação ao prazo, e pagamento por km.</li>
<li>Se o combustível chega até o destino, e o AdBlue.</li>
<li>Dano de cada peça do caminhão e do reboque, e dano da carga.</li>
<li>Temperatura do óleo, da água e dos freios, pressão de ar e de óleo, tensão da bateria.</li>
<li>Luzes do painel: faróis, setas, pisca-alerta, giroflex, limpadores, freio motor, retarder, bloqueio do diferencial, freio de mão, eixo elevável e reboque.</li>
<li>Totais da sessão: distância rodada, tempo ao volante, velocidade média e máxima, combustível gasto e ganho líquido.</li>
</ul>
<p>S, M e L mudam o tamanho; o X volta para o mapa.</p>
<h3>Numa segunda tela</h3>
<p>Abra <a href="/dash/">trucksim-dash.com/dash</a> em outro aparelho (tablet, celular antigo, segundo monitor) e digite o mesmo código de pareamento. O GPS e o painel podem rodar ao mesmo tempo. Nas Configurações há o botão <b>Copiar o link do painel</b>.</p>`,
    buttons: `
<p>O botão de controle no mapa abre uma fileira de comandos do caminhão. Toque num e o cliente no seu PC aperta a tecla no jogo por você.</p>`,
    settings: `
<p>A engrenagem abre as Configurações:</p>
<ul>
<li><b>Unidades</b> (km ou milhas) e <b>idioma</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: o que mostrar quando o painel de informações está oculto.</li>
<li><b>Outros motoristas por perto</b>: compartilhar sua posição, ou esconder os marcadores dos outros.</li>
<li><b>Botões do mapa</b>: estilo escuro para combinar com o mapa, esmaecer ao dirigir (voltam ao tocar), e <b>Mover os botões</b>: arraste qualquer botão ou painel, e o canto para redimensionar, com grade e um Restaurar.</li>
<li><b>Mapa base real</b>: litoral, lagos, rios e áreas urbanas embaixo das estradas (cerca de 1 MB a mais).</li>
<li><b>Modo leve</b> para celulares e tablets antigos: desenho mais leve e, se quiser, sem cálculo de rota, para economizar o máximo de memória.</li>
<li><b>Preferência de rota</b>: a mais rápida ou a mais curta.</li>
<li><b>Pagamento na sua moeda</b>, ao lado do € ou $ do jogo.</li>
<li><b>Cor da linha da rota</b>: vermelho, azul ou verde.</li>
<li><b>Zoom do mapa no modo navegação</b>.</li>
<li><b>Orientação por voz</b>: no modo navegação, avisa cada curva com antecedência e de novo na curva, além da chegada, sem nomes de estradas.</li>
<li><b>Remapear teclas</b> da botoeira.</li>
<li><b>Painel em outro aparelho</b>: copiar o link.</li>
<li><b>Histórico de viagens</b>: suas entregas, salvas só neste aparelho.</li>
<li><b>Relatar um problema</b>, o roadmap e o changelog.</li>
</ul>
<p>Num celular estreito, alguns botões da barra de cima vão para as Configurações.</p>
<div class="tip"><p>Cada entrega também é publicada no canal <b>#jobs</b> do nosso <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a>: rota, caminhão, carga, distância e pagamento, sem nome e sem conta.</p></div>`,
    convoy: `
<p>Dirija com amigos e vejam uns aos outros no mapa. Cada um usa o próprio jogo e cliente: não precisa estar na mesma sessão multiplayer.</p>
<ul>
<li>Abra o botão de comboio na barra de cima, escolha um apelido e <b>Criar comboio</b>, ou digite o código de 6 caracteres de um amigo e <b>Entrar</b>. <b>Copiar link</b> para colar no Discord.</li>
<li>Os membros aparecem no mapa e numa fileira de cartões: a que distância estão, a viagem deles e o pagamento, se escolherem compartilhar.</li>
<li><b>Seguir o líder</b>, e <b>Ver rota</b> para saber para onde cada um vai.</li>
<li><b>Mensagens rápidas</b> pelo mapa: Tudo certo, Parada na próxima área, Preciso de combustível, Estou ficando para trás, Me esperem, Vamos.</li>
<li>Amigos sem o jogo podem abrir o link e assistir.</li>
<li>Se quiser, um resumo é publicado no Discord do Truck Dash quando o comboio termina. Depois disso nada fica guardado.</li>
</ul>
<p>O comboio precisa da conexão pela internet (trucksim-dash.com/app com o seu código), não do endereço da mesma Wi-Fi.</p>`,
    client: `
<p>Clique com o botão direito no ícone da bandeja, ao lado do relógio:</p>
<ul>
<li><b>Configuração e status</b>: o código de pareamento, o endereço para a mesma Wi-Fi com o QR code, o plugin de cada jogo (instalações da Steam são encontradas sozinhas; <b>Adicionar pasta do jogo</b> para as outras) e as opções.</li>
<li><b>Opções</b>: iniciar com o Windows (abre o painel quando o jogo inicia), mostrar sua viagem no seu perfil do Discord, fechar o Truck Dash quando o jogo fechar, e abrir o painel no navegador ao iniciar.</li>
<li><b>Mostrar código de pareamento</b>, e <b>Desconectar</b>, que te dá um código novo.</li>
<li><b>Verificar atualizações</b>. O cliente e o app também avisam quando sai uma versão nova.</li>
<li><b>Ver arquivo de log</b> e <b>Relatar um problema</b>.</li>
</ul>
<div class="tip"><p>Algo não funciona? Pergunte no nosso <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> e anexe o arquivo de log: a maioria dos problemas se resolve em poucas mensagens.</p></div>`,
    account: `
<p>Uma conta guarda seu histórico de direção: cada entrega que você faz, com a rota num mapa. É opcional e grátis, e todo o resto do Truck Dash funciona igual sem ela.</p>
<ol>
<li>Entre em <a href="/account/">trucksim-dash.com/account</a> com Discord, Google, ou um e-mail e uma senha. Com e-mail, enviamos um código de 6 dígitos para confirmar o endereço.</li>
<li>No cliente, abra <b>Configuração e status</b> e clique em <b>Vincular conta</b>. Uma página abre no navegador: confirme, e o cliente fica vinculado.</li>
</ol>
<p>A partir daí, cada entrega é salva quando você entrega ou cancela: a rota colorida pela velocidade, a distância (a do jogo e a que medimos), o pagamento, o combustível, os pedágios, as multas, o dano, o tempo ao volante e as horas de sono, se chegou no prazo ou atrasado, e os países ou estados por onde passou. Sua conta tem o diário de bordo (com exportação CSV), estatísticas por jogo, recordes e conquistas. <b>Minha conta</b>, no menu da bandeja, leva você até lá.</p>
<h3>Bom saber</h3>
<ul>
<li>Nada é salvo até você vincular o cliente. Seu perfil é privado, a menos que você o torne público em <b>Configurações</b>.</li>
<li>Em <b>Seguindo</b> você pode seguir outros motoristas pelo nome de usuário. É preciso que aceitem, e quem você aceitar vê suas viagens com a rota, onde você está enquanto dirige e suas conquistas, mesmo com o perfil privado. Suas notas continuam só suas.</li>
<li>Se você entregar com o Truck Dash fechado, não vemos a entrega e a viagem aparece como <b>sem terminar</b>. Você pode marcá-la como cancelada, mas só o jogo pode informar uma entrega.</li>
<li>Ficou sem internet um tempo? Nada se perde: o cliente guarda a viagem e envia quando a conexão voltar.</li>
<li>Entregas com um mod de dinheiro ficam marcadas e fora dos seus totais de dinheiro.</li>
<li>Em <b>Configurações</b> você pode baixar todos os seus dados ou excluir a conta.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Um botão fica <b>azul</b> quando aquilo está ligado no seu caminhão (motor funcionando, faróis acesos, reboque engatado, piloto automático ativo), então a fileira também serve de painel de status.</p>
<h3>Suas teclas</h3>
<p>Os botões vêm com teclas padrão. Se você mudou os controles no jogo, ajuste igual nas Configurações, <b>Remapear teclas</b>. Deixe uma tecla vazia para desativar o botão.</p>
<h3>Botões personalizados</h3>
<p><b>Adicionar botão</b> cria até 3 seus: dê um nome e aperte a tecla (combinações com Ctrl, Shift e Alt funcionam, assim como F1 a F24 e o teclado numérico). Depois associe a mesma tecla ao que quiser nos controles do jogo: bloqueio do diferencial, retarder, buzina, o rádio.</p>
<div class="tip"><p>No celular em pé, a botoeira é mais uma página do painel de informações: deslize até ela. O cliente precisa estar rodando com o jogo aberto; na demo os botões não fazem nada.</p></div>`,
  },
  ic: {
    recenterBtn: ['Centralizar', 'Volta para o seu caminhão e para o zoom de navegação.'],
    fullscreenBtn: ['Tela cheia', 'Esconde a barra de cima e as do celular.'],
    navToggleBtn: ['Modo navegação', 'O mapa gira com você, aproxima nas curvas e dá instruções.'],
    tilt3dBtn: ['Visão 3D', 'Visão inclinada, no modo navegação.'],
    waypointBtn: ['Waypoint', 'Toque nele e depois no mapa. Até 9.'],
    commandsToggleBtn: ['Botoeira', 'Comandos do caminhão: faróis, motor, pisca-alerta e mais.'],
    convoyMsgBtn: ['Mensagem ao comboio', 'Mensagens rápidas, enquanto você está num comboio.'],
    panelToggleBtn: ['Painel de informações', 'Mostra ou esconde; escondido, o mini-HUD assume.'],
    poiBtn: ['Buscar por perto', 'Postos, descanso, oficinas, empresas e mais.'],
    dashBtn: ['Painel', 'Painel de instrumentos em tela cheia.'],
    settingsBtn: ['Configurações', 'Tudo o que está na lista acima.'],
    helpBtn: ['Tour rápido', 'Repete o tour guiado da tela.'],
    unitToggle: ['Unidades', 'Quilômetros ou milhas.'],
    langSelect: ['Idioma', 'Oito idiomas.'],
    modsBtn: ['Mods de mapa', 'Detectados pelo jogo, ou escolhidos à mão.'],
    convoyBtn: ['Comboio', 'Dirigir com amigos.'],
    discordBtn: ['Discord', 'A comunidade: ajuda, ideias e #jobs.'],
  },
  cmd: {
    cmdHazards: 'Pisca-alerta', cmdBeacon: 'Giroflex', cmdHandbrake: 'Freio de mão', cmdEngine: 'Motor',
    cmdTrailer: 'Reboque', cmdCamera: 'Câmera', cmdCruise: 'Cruise', cmdLights: 'Faróis',
    cmdHighBeam: 'Farol alto', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Eixo elevável', cmdWipers: 'Limpadores',
    add: 'Adicionar botão',
  },
};

GUIDE_TEXT.pl = {
  title: 'Przewodnik',
  lead: 'Wszystko, co potrafi Truck Dash, ekran po ekranie. Truck Dash to darmowy GPS i deska rozdzielcza do Euro Truck Simulator 2 i American Truck Simulator, na telefonie, tablecie albo drugim monitorze. Konto nie jest potrzebne.',
  openApp: 'Otwórz aplikację',
  demo: 'Wypróbuj demo',
  toc: 'Spis treści',
  backTop: 'Do góry',
  privacy: 'Prywatność',
  support: 'Wesprzyj',
  h: {
    start: 'Pierwsze kroki',
    status: 'Wskaźnik stanu',
    gps: 'GPS',
    panel: 'Panel informacji',
    dash: 'Deska rozdzielcza',
    buttons: 'Przyciski ciężarówki',
    settings: 'Ustawienia i górny pasek',
    convoy: 'Konwój (beta)',
    client: 'Klient na twoim PC',
    account: 'Twoje konto (opcjonalne)',
  },
  legend: { gps: 'Przyciski mapy', settings: 'Górny pasek' },
  cap: {
    map: 'Poziomo: mapa z trasą, panel informacji i przyciski ciężarówki.',
    phone: 'Tryb nawigacji na telefonie.',
    dash: 'Deska rozdzielcza na pełnym ekranie.',
  },
  b: {
    start: `
<ol>
<li>Pobierz klienta ze strony <a href="/">trucksim-dash.com</a> i uruchom <code>TruckDash.exe</code> na komputerze, na którym grasz. Działa w zasobniku systemowym, obok zegara.</li>
<li>Kliknij ikonę prawym przyciskiem, otwórz <b>Konfiguracja i stan</b> i kliknij <b>Zainstaluj wtyczkę</b> przy swojej grze. Jeśli gra była otwarta, uruchom ją ponownie.</li>
<li>Na telefonie otwórz <a href="/app/">trucksim-dash.com/app</a> i wpisz <b>kod parowania</b>, który pokazuje klient. Telefon nie musi być w tej samej sieci Wi-Fi.</li>
</ol>
<p>Nieużyty kod wygasa po 10 minutach. Po połączeniu sesja trwa, dopóki nie zamkniesz klienta.</p>
<h3>Ta sama sieć Wi-Fi: najmniejsze opóźnienie</h3>
<p>Konfiguracja i stan pokazuje też adres lokalny i kod QR. Zeskanuj go telefonem i gotowe: bez kodu parowania, a działa dalej nawet bez internetu. Windows raz zapyta o zgodę w zaporze.</p>
<div class="tip"><p>W przeglądarce telefonu użyj <b>Dodaj do ekranu głównego</b>: Truck Dash otworzy się wtedy na pełnym ekranie, jak aplikacja.</p></div>
<p>Nie masz gry pod ręką? <a href="/app/?demo=1">Demo</a> odtwarza trasę na prawdziwej mapie ATS.</p>`,
    status: `
<p>Wskaźnik w lewym górnym rogu aplikacji mówi, co się dzieje na każdym etapie:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Klient nie działa</b>: uruchom TruckDash.exe na komputerze albo sprawdź jego ikonę w zasobniku.</span></li>
<li><span class="dot"></span><span><b>Czekam na grę</b>: klient jest połączony; uruchom ETS2 albo ATS.</span></li>
<li><span class="dot bad"></span><span><b>Wtyczka nie zainstalowana</b>: gra działa, ale nie wysyła danych. Konfiguracja i stan, Zainstaluj wtyczkę, a potem uruchom grę ponownie.</span></li>
<li><span class="dot"></span><span><b>W menu</b>: wsiądź do ciężarówki i dane zaczną płynąć.</span></li>
<li><span class="dot ok"></span><span><b>Na żywo</b>: wszystko działa. Gdy gra jest wstrzymana, widać <b>Pauza</b>.</span></li>
<li><span class="dot bad"></span><span><b>Nieprawidłowy lub wygasły kod</b>: weź nowy z ikony w zasobniku, <b>Pokaż kod parowania</b>.</span></li>
</ul>`,
    gps: `
<p>Trasa do celu zlecenia rysuje się <b>sama</b>, gdy tylko weźmiesz zlecenie: szybkie zlecenia i giełda frachtów, w tym zlecenia z samochodami z Road Trip: Ford (klient 1.5.21 lub nowszy). Trasa uwzględnia twój wybór w Ustawieniach: najszybsza, jak GPS w grze, albo najkrótsza.</p>
<p><b>Podsumowanie trasy</b> na dole mapy pokazuje pozostały dystans, pozostały czas i godzinę przyjazdu, z paskiem postępu. Strzałka zwija je do cienkiego paska postępu (dotknij go, by otworzyć ponownie), a przycisk z przekreśloną trasą usuwa trasę z mapy.</p>
<h3>Tryb nawigacji</h3>
<p>Mapa obraca się zgodnie z kierunkiem jazdy, przybliża się przed skrętami i pokazuje wskazówki u góry, np. <i>Trzymaj się prawej na I-15 w kierunku Provo</i>. W Ustawieniach wybierzesz, jak blisko mapa za tobą podąża. Nadal możesz przybliżać dwoma palcami; przycisk wyśrodkowania przywraca widok.</p>
<h3>Punkty trasy</h3>
<p>Dotknij flagi, a potem miejsca na mapie, maksymalnie 9 przystanków. Aplikacja zapyta, czy ustawiłeś ten punkt także w GPS gry:</p>
<ul>
<li><b>Tak</b>: ETA gry już uwzględnia objazd, więc aplikacja tylko rysuje trasę przez ten punkt.</li>
<li><b>Nie</b>: aplikacja liczy własny dystans i czas przez ten punkt i pokazuje je jako <i>przez punkt trasy</i> pod ETA.</li>
</ul>
<h3>Szukaj w pobliżu</h3>
<p>Lupa znajduje stacje paliw, parkingi, serwisy, garaże, dealerów ciężarówek i wagi w pobliżu, albo dowolną firmę czy miasto. Dotknij wyniku, a trasa poprowadzi przez to miejsce. <b>Najbliższa stacja paliw</b> to jedno dotknięcie.</p>
<h3>Także na mapie</h3>
<ul>
<li><b>Niebieska linia</b> za ciężarówką pokazuje, gdzie jechałeś.</li>
<li>Z włączonym <b>Udostępniaj moją pozycję</b> widzisz innych kierowców Truck Dash na swojej mapie i pojawiasz się anonimowo na publicznej <a href="/live/">mapie na żywo</a>, razem z trasą, chyba że odznaczysz <b>Pokazuj też moją trasę na mapie na żywo</b>. Możesz to wyłączyć w Ustawieniach.</li>
<li><b>Mody map</b> mają własne mapy: ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia i TruckersMP. Aplikacja wykrywa je z gry, albo wybierasz jedną przyciskiem z puzzlem.</li>
<li><b>DLC</b> (w Ustawieniach): odznacz DLC z mapami, których nie masz, a trasy ominą ich drogi. Jeśli nie da się ich objechać, trasa i tak przez nie poprowadzi i da znać. Z klientem 1.5.28 lub nowszym są odczytywane z gry automatycznie.</li>
</ul>
<p>Każdy przycisk mapy można przesunąć i zmienić jego rozmiar: przytrzymaj go na telefonie albo użyj <b>Przesuń przyciski</b> w Ustawieniach.</p>`,
    panel: `
<p>Obok mapy w poziomie, pod nią na telefonie trzymanym pionowo (przesuń w bok, by zobaczyć kolejne strony).</p>
<h3>Karta Dane</h3>
<ul>
<li>Prędkość, ograniczenie, numer drogi i prędkość tempomatu.</li>
<li>Paliwo, zasięg i średnie spalanie, mierzone na podstawie twojej jazdy po przejechaniu 15 km (do tego czasu wartość z gry).</li>
<li><b>Trasa</b>: start i cel, ładunek, ETA w czasie gry, <b>ETA rzeczywisty</b> w prawdziwych minutach, następne miasto, czas gry, termin zlecenia, następny odpoczynek z poziomem zmęczenia i zapłata. Zapłatę można też pokazać w twojej walucie.</li>
<li><b>Ciężarówka</b>: model, licznik, zużycie każdej części i ostrzeżenia, np. niskie ciśnienie powietrza, za wysoka temperatura wody lub oleju, słaby akumulator.</li>
<li><b>Sesja</b>: opłaty drogowe, mandaty oraz przeprawy promem lub pociągiem, z przyciskiem Resetuj.</li>
</ul>
<h3>Karta Zegary</h3>
<p>Prędkościomierz, obrotomierz z biegiem, pasek paliwa, licznik i zasięg.</p>
<h3>Mini-HUD</h3>
<p>Ukryj panel przyciskiem z trzema kreskami, a mapa zajmie cały ekran; prędkość i ograniczenie zostaną w rogu. W Ustawieniach wybierasz, co jeszcze pokazuje mini-HUD: paliwo, zasięg, ETA, pozostały dystans, następny odpoczynek ze zmęczeniem, tempomat i wskazówki GPS.</p>`,
    dash: `
<p>Przycisk z prędkościomierzem na górnym pasku otwiera deskę rozdzielczą na pełnym ekranie:</p>
<ul>
<li>Pasek trasy, który zaznacza, gdzie trzeba będzie odpocząć.</li>
<li>Czy zdążysz przed terminem, i zapłata za km.</li>
<li>Czy paliwa wystarczy do celu, oraz AdBlue.</li>
<li>Uszkodzenia każdej części ciężarówki i naczepy oraz ładunku.</li>
<li>Temperatura oleju, wody i hamulców, ciśnienie powietrza i oleju, napięcie akumulatora.</li>
<li>Kontrolki: światła, kierunkowskazy, światła awaryjne, kogut, wycieraczki, hamulec silnikowy, retarder, blokada mechanizmu różnicowego, hamulec ręczny, oś podnoszona i naczepa.</li>
<li>Podsumowanie sesji: przejechany dystans, czas za kierownicą, średnia i maksymalna prędkość, zużyte paliwo i zysk netto.</li>
</ul>
<p>S, M i L zmieniają rozmiar; X wraca do mapy.</p>
<h3>Na drugim ekranie</h3>
<p>Otwórz <a href="/dash/">trucksim-dash.com/dash</a> na innym urządzeniu (tablet, stary telefon, drugi monitor) i wpisz ten sam kod parowania. GPS i deska rozdzielcza mogą działać jednocześnie. W Ustawieniach jest przycisk <b>Skopiuj link do deski rozdzielczej</b>.</p>`,
    buttons: `
<p>Przycisk z padem na mapie otwiera rząd poleceń ciężarówki. Dotknij jednego, a klient na komputerze naciśnie klawisz w grze za ciebie.</p>`,
    settings: `
<p>Zębatka otwiera Ustawienia:</p>
<ul>
<li><b>Jednostki</b> (km lub mile) i <b>język</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: co pokazywać, gdy panel informacji jest ukryty.</li>
<li><b>Inni kierowcy w pobliżu</b>: udostępniaj swoją pozycję albo ukryj znaczniki innych.</li>
<li><b>Przyciski mapy</b>: ciemny styl pasujący do mapy, przygaszanie podczas jazdy (wracają po dotknięciu) i <b>Przesuń przyciski</b>: przeciągnij dowolny przycisk lub panel, a jego róg, by zmienić rozmiar, z siatką i przyciskiem Przywróć.</li>
<li><b>Prawdziwa mapa bazowa</b>: wybrzeża, jeziora, rzeki i tereny zabudowane pod drogami (około 1 MB więcej).</li>
<li><b>Tryb lekki</b> dla starych telefonów i tabletów: lżejsze rysowanie i opcjonalnie bez wyznaczania trasy, by oszczędzić najwięcej pamięci.</li>
<li><b>Preferencja trasy</b>: najszybsza lub najkrótsza.</li>
<li><b>Zapłata w twojej walucie</b>, obok € lub $ z gry.</li>
<li><b>Kolor linii trasy</b>: czerwony, niebieski lub zielony.</li>
<li><b>Przybliżenie mapy w trybie nawigacji</b>.</li>
<li><b>Wskazówki głosowe</b>: w trybie nawigacji zapowiadają każdy skręt z wyprzedzeniem i ponownie przy skręcie, a także przyjazd, bez nazw dróg.</li>
<li><b>Zmień klawisze</b> przycisków ciężarówki.</li>
<li><b>Deska rozdzielcza na innym urządzeniu</b>: skopiuj link.</li>
<li><b>Historia tras</b>: twoje dostawy, zapisane tylko na tym urządzeniu.</li>
<li><b>Zgłoś problem</b>, plan rozwoju i lista zmian.</li>
</ul>
<p>Na wąskim telefonie część przycisków z górnego paska przenosi się do Ustawień.</p>
<div class="tip"><p>Każda dostawa trafia też na kanał <b>#jobs</b> na naszym <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discordzie</a>: trasa, ciężarówka, ładunek, dystans i zapłata, bez nazwy i bez konta.</p></div>`,
    convoy: `
<p>Jedź ze znajomymi i widzcie się nawzajem na mapie. Każdy ma własną grę i klienta: nie musicie być w tej samej sesji multiplayer.</p>
<ul>
<li>Otwórz przycisk konwoju na górnym pasku, wybierz pseudonim i <b>Utwórz konwój</b>, albo wpisz 6-znakowy kod znajomego i <b>Dołącz</b>. <b>Kopiuj link</b>, żeby wkleić go na Discordzie.</li>
<li>Członkowie pojawiają się na mapie i w rzędzie kart: jak daleko są, ich trasa i zapłata, jeśli zechcą ją pokazać.</li>
<li><b>Jedź za liderem</b>, i <b>Pokaż trasę</b>, żeby zobaczyć, dokąd ktoś jedzie.</li>
<li><b>Szybkie wiadomości</b> z mapy: Wszystko gra, Postój na następnym parkingu, Potrzebuję paliwa, Zostaję w tyle, Poczekajcie na mnie, Jedziemy.</li>
<li>Znajomi bez gry mogą otworzyć link i oglądać.</li>
<li>Jeśli chcesz, po zakończeniu konwoju podsumowanie trafi na Discorda Truck Dash. Potem nic nie jest przechowywane.</li>
</ul>
<p>Konwój wymaga połączenia przez internet (trucksim-dash.com/app z twoim kodem), a nie adresu w tej samej sieci Wi-Fi.</p>`,
    client: `
<p>Kliknij prawym przyciskiem ikonę w zasobniku, obok zegara:</p>
<ul>
<li><b>Konfiguracja i stan</b>: kod parowania, adres dla tej samej sieci Wi-Fi z kodem QR, wtyczka dla każdej gry (instalacje ze Steam są wykrywane same; <b>Dodaj folder gry</b> dla pozostałych) i opcje.</li>
<li><b>Opcje</b>: uruchamiaj z Windows (otwiera deskę rozdzielczą, gdy startuje gra), pokazuj trasę w profilu Discord, zamykaj Truck Dash razem z grą i otwieraj deskę rozdzielczą w przeglądarce przy starcie.</li>
<li><b>Pokaż kod parowania</b>, oraz <b>Rozłącz</b>, które daje nowy kod.</li>
<li><b>Sprawdź aktualizacje</b>. Klient i aplikacja same też dają znać o nowej wersji.</li>
<li><b>Pokaż plik dziennika</b> i <b>Zgłoś problem</b>.</li>
</ul>
<div class="tip"><p>Coś nie działa? Zapytaj na naszym <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discordzie</a> i dołącz plik dziennika: większość problemów rozwiązujemy w kilku wiadomościach.</p></div>`,
    account: `
<p>Konto przechowuje historię twojej jazdy: każde zlecenie, które wykonasz, z trasą na mapie. Jest opcjonalne i darmowe, a cała reszta Truck Dash działa tak samo bez niego.</p>
<ol>
<li>Zaloguj się na <a href="/account/">trucksim-dash.com/account</a> przez Discord, Google albo e-mail i hasło. Przy e-mailu wysyłamy 6-cyfrowy kod do potwierdzenia adresu.</li>
<li>W kliencie otwórz <b>Konfiguracja i stan</b> i kliknij <b>Powiąż konto</b>. W przeglądarce otworzy się strona: potwierdź i klient jest powiązany.</li>
</ol>
<p>Od tej chwili każde zlecenie zapisuje się przy dostarczeniu lub anulowaniu: trasa pokolorowana według prędkości, dystans (z gry i zmierzony przez nas), zarobek, paliwo, opłaty drogowe, mandaty, uszkodzenia, czas jazdy i godziny snu, na czas czy spóźnione, oraz kraje lub stany, przez które jechałeś. Na koncie masz dziennik (z eksportem do CSV), statystyki dla każdej gry, rekordy i osiągnięcia. <b>Moje konto</b> w menu w zasobniku prowadzi prosto tam.</p>
<h3>Warto wiedzieć</h3>
<ul>
<li>Nic nie jest zapisywane, dopóki nie powiążesz klienta. Twój profil jest prywatny, chyba że udostępnisz go publicznie w <b>Ustawieniach</b>.</li>
<li>W <b>Obserwowanych</b> możesz obserwować innych kierowców po nazwie użytkownika. Muszą to zaakceptować, a osoby, które zaakceptujesz, widzą twoje trasy z przebiegiem, gdzie jesteś podczas jazdy i twoje osiągnięcia, nawet przy prywatnym profilu. Notatki zostają tylko twoje.</li>
<li>Jeśli dostarczysz zlecenie przy zamkniętym Truck Dash, nie widzimy dostarczenia i trasa jest oznaczona jako <b>niedokończona</b>. Możesz oznaczyć ją jako anulowaną, ale dostarczenie może zgłosić tylko gra.</li>
<li>Nie masz przez chwilę internetu? Nic nie ginie: klient zachowuje trasę i wysyła ją, gdy wrócisz do sieci.</li>
<li>Zlecenia z modem pieniędzy są oznaczone i nie wliczają się do sum pieniędzy.</li>
<li>W <b>Ustawieniach</b> możesz pobrać wszystkie swoje dane albo usunąć konto.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Przycisk robi się <b>niebieski</b>, gdy dana rzecz jest włączona w ciężarówce (silnik pracuje, światła włączone, naczepa podpięta, tempomat ustawiony), więc rząd przycisków służy też jako panel stanu.</p>
<h3>Twoje klawisze</h3>
<p>Przyciski mają domyślne klawisze. Jeśli zmieniłeś sterowanie w grze, ustaw to samo w Ustawieniach, <b>Zmień klawisze</b>. Zostaw pole puste, by wyłączyć przycisk.</p>
<h3>Własne przyciski</h3>
<p><b>Dodaj przycisk</b> tworzy do 3 własnych: nadaj nazwę i naciśnij klawisz (działają kombinacje z Ctrl, Shift i Alt, a także F1 do F24 i klawiatura numeryczna). Potem przypisz ten sam klawisz do czegokolwiek w sterowaniu gry: blokady mechanizmu różnicowego, retardera, klaksonu, radia.</p>
<div class="tip"><p>Na telefonie trzymanym pionowo przyciski ciężarówki są kolejną stroną panelu informacji: przesuń do niej. Klient musi działać przy otwartej grze; w demo przyciski nic nie robią.</p></div>`,
  },
  ic: {
    recenterBtn: ['Wyśrodkuj', 'Wraca do ciężarówki i do twojego przybliżenia nawigacji.'],
    fullscreenBtn: ['Pełny ekran', 'Ukrywa górny pasek i paski telefonu.'],
    navToggleBtn: ['Tryb nawigacji', 'Mapa obraca się z tobą, przybliża przy skrętach i daje wskazówki.'],
    tilt3dBtn: ['Widok 3D', 'Pochylony widok, w trybie nawigacji.'],
    waypointBtn: ['Punkt trasy', 'Dotknij, a potem dotknij mapy. Do 9.'],
    commandsToggleBtn: ['Przyciski ciężarówki', 'Polecenia: światła, silnik, awaryjne i więcej.'],
    convoyMsgBtn: ['Wiadomość do konwoju', 'Szybkie wiadomości, gdy jesteś w konwoju.'],
    panelToggleBtn: ['Panel informacji', 'Pokazuje lub ukrywa; po ukryciu działa mini-HUD.'],
    poiBtn: ['Szukaj w pobliżu', 'Paliwo, parkingi, serwisy, firmy i więcej.'],
    dashBtn: ['Deska rozdzielcza', 'Wskaźniki na pełnym ekranie.'],
    settingsBtn: ['Ustawienia', 'Wszystko z listy powyżej.'],
    helpBtn: ['Krótki przewodnik', 'Ponownie pokazuje przewodnik po ekranie.'],
    unitToggle: ['Jednostki', 'Kilometry lub mile.'],
    langSelect: ['Język', 'Osiem języków.'],
    modsBtn: ['Mody map', 'Wykryte z gry albo wybrane ręcznie.'],
    convoyBtn: ['Konwój', 'Jazda ze znajomymi.'],
    discordBtn: ['Discord', 'Społeczność: pomoc, pomysły i #jobs.'],
  },
  cmd: {
    cmdHazards: 'Awaryjne', cmdBeacon: 'Kogut', cmdHandbrake: 'Hamulec ręczny', cmdEngine: 'Silnik',
    cmdTrailer: 'Naczepa', cmdCamera: 'Kamera', cmdCruise: 'Tempomat', cmdLights: 'Światła',
    cmdHighBeam: 'Światła drogowe', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Oś podnoszona', cmdWipers: 'Wycieraczki',
    add: 'Dodaj przycisk',
  },
};

GUIDE_TEXT.tr = {
  title: 'Kullanım kılavuzu',
  lead: 'Truck Dash ile yapabileceğin her şey, ekran ekran. Truck Dash, Euro Truck Simulator 2 ve American Truck Simulator için telefonda, tablette veya ikinci bir monitörde çalışan ücretsiz bir GPS ve gösterge panelidir. Hesap gerekmez.',
  openApp: 'Uygulamayı aç',
  demo: 'Demoyu dene',
  toc: 'İçindekiler',
  backTop: 'Başa dön',
  privacy: 'Gizlilik',
  support: 'Destekle',
  h: {
    start: 'Başlarken',
    status: 'Durum göstergesi',
    gps: 'GPS',
    panel: 'Bilgi paneli',
    dash: 'Gösterge paneli',
    buttons: 'Kamyon düğme kutusu',
    settings: 'Ayarlar ve üst çubuk',
    convoy: 'Konvoy (beta)',
    client: 'Bilgisayarındaki istemci',
    account: 'Hesabın (isteğe bağlı)',
  },
  legend: { gps: 'Harita düğmeleri', settings: 'Üst çubuk' },
  cap: {
    map: 'Yatay: rotalı harita, bilgi paneli ve düğme kutusu.',
    phone: 'Telefonda navigasyon modu.',
    dash: 'Tam ekran gösterge paneli.',
  },
  b: {
    start: `
<ol>
<li>İstemciyi <a href="/">trucksim-dash.com</a> adresinden indir ve oyunu oynadığın bilgisayarda <code>TruckDash.exe</code> dosyasını çalıştır. Saatin yanındaki sistem tepsisinde durur.</li>
<li>Tepsi simgesine sağ tıkla, <b>Kurulum ve durum</b> penceresini aç ve oyunun için <b>Eklentiyi yükle</b> düğmesine tıkla. Oyun açıksa yeniden başlat.</li>
<li>Telefonunda <a href="/app/">trucksim-dash.com/app</a> adresini aç ve istemcinin gösterdiği <b>eşleştirme kodunu</b> yaz. Telefonun aynı Wi-Fi ağında olması gerekmez.</li>
</ol>
<p>Kod kullanılmazsa 10 dakika sonra geçersiz olur. Bağlandıktan sonra oturum, istemciyi kapatana kadar sürer.</p>
<h3>Aynı Wi-Fi: en düşük gecikme</h3>
<p>Kurulum ve durum penceresi yerel bir adres ve bir QR kod da gösterir. Telefonla tara ve hazırsın: eşleştirme kodu yok, internet kesilse bile çalışmaya devam eder. Windows güvenlik duvarı için bir kez izin ister.</p>
<div class="tip"><p>Telefonun tarayıcısında <b>Ana ekrana ekle</b> seçeneğini kullan: Truck Dash artık bir uygulama gibi tam ekran açılır.</p></div>
<p>Oyun yanında değil mi? <a href="/app/?demo=1">Demo</a>, gerçek ATS haritasında bir yolculuk oynatır.</p>`,
    status: `
<p>Uygulamanın sol üstündeki gösterge her adımda ne olduğunu söyler:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>İstemci çalışmıyor</b>: bilgisayarında TruckDash.exe dosyasını çalıştır veya tepsideki simgesine bak.</span></li>
<li><span class="dot"></span><span><b>Oyun bekleniyor</b>: istemci bağlı; ETS2 veya ATS'yi aç.</span></li>
<li><span class="dot bad"></span><span><b>Eklenti yüklü değil</b>: oyun açık ama veri göndermiyor. Kurulum ve durum, Eklentiyi yükle, sonra oyunu yeniden başlat.</span></li>
<li><span class="dot"></span><span><b>Menüde</b>: kamyona bin, veriler gelmeye başlar.</span></li>
<li><span class="dot ok"></span><span><b>Canlı</b>: her şey yolunda. Oyun duraklatıldığında <b>Duraklatıldı</b> yazar.</span></li>
<li><span class="dot bad"></span><span><b>Geçersiz veya süresi dolmuş kod</b>: tepsi simgesinden yenisini al, <b>Eşleştirme kodunu göster</b>.</span></li>
</ul>`,
    gps: `
<p>Bir iş aldığın anda, işin varış noktasına giden rota <b>otomatik olarak</b> çizilir: hızlı işler ve yük pazarı, Road Trip: Ford'daki araba taşıma işleri de dahil (istemci 1.5.21 veya daha yenisi). Rota, Ayarlar'daki tercihine uyar: oyunun GPS'i gibi en hızlı veya en kısa.</p>
<p>Haritanın altındaki <b>rota özeti</b> kalan mesafeyi, kalan süreyi ve varış saatini bir ilerleme çubuğuyla gösterir. Ok onu ince bir ilerleme çubuğuna küçültür (tekrar açmak için çubuğa dokun); üstü çizili rota düğmesi ise rotayı haritadan kaldırır.</p>
<h3>Navigasyon modu</h3>
<p>Harita gidiş yönünle birlikte döner, dönüşlerden önce yakınlaşır ve üstte <i>I-15 üzerinden Provo yönüne sağdan devam et</i> gibi yönlendirmeler gösterir. Ne kadar yakından takip edeceğini Ayarlar'da seçersin. İki parmakla yakınlaştırmaya devam edebilirsin; ortalama düğmesi seni geri getirir.</p>
<h3>Ara noktalar</h3>
<p>Bayrağa, sonra haritada bir yere dokun; en fazla 9 durak. Uygulama, bu noktayı oyunun kendi GPS'inde de işaretleyip işaretlemediğini sorar:</p>
<ul>
<li><b>Evet</b>: oyunun varış süresi sapmayı zaten hesaba katar; uygulama yalnızca rotayı oradan geçirerek çizer.</li>
<li><b>Hayır</b>: uygulama o noktadan geçen kendi mesafe ve süresini hesaplar ve varış sürelerinin altında <i>ara nokta üzerinden</i> olarak gösterir.</li>
</ul>
<h3>Yakında ara</h3>
<p>Büyüteç yakınındaki benzin istasyonlarını, dinlenme alanlarını, servisleri, garajları, kamyon bayilerini ve kantarları, ya da herhangi bir şirketi veya şehri bulur. Bir sonuca dokun, rota oradan geçsin. <b>En yakın benzin istasyonu</b> tek dokunuş.</p>
<h3>Haritada ayrıca</h3>
<ul>
<li>Kamyonun arkasındaki <b>mavi çizgi</b> geçtiğin yolu gösterir.</li>
<li><b>Konumumu paylaş</b> açıkken haritanda diğer Truck Dash sürücülerini görürsün ve herkese açık <a href="/live/">canlı haritada</a> anonim bir sürücü olarak, rotanla birlikte görünürsün (<b>Rotamı da canlı haritada göster</b> işaretini kaldırmadıkça). Ayarlar'dan kapatabilirsin.</li>
<li><b>Harita modlarının</b> kendi haritaları var: ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia ve TruckersMP. Uygulama bunları oyundan algılar ya da yapboz düğmesiyle kendin seçersin.</li>
<li><b>DLC'ler</b> (Ayarlar'da): sahip olmadığın harita DLC'lerinin işaretini kaldır, rotalar onların yollarından kaçınır. Başka yol yoksa rota yine de kullanır ve bunu söyler. İstemci 1.5.28 veya daha yenisiyle oyunundan kendiliğinden okunur.</li>
</ul>
<p>Tüm harita düğmeleri taşınabilir ve boyutları değiştirilebilir: telefonda birine uzun bas ya da Ayarlar'da <b>Düğmeleri taşı</b> seçeneğini kullan.</p>`,
    panel: `
<p>Yatayda haritanın yanında, telefon dikken haritanın altında (diğer sayfalar için yana kaydır).</p>
<h3>Veriler sekmesi</h3>
<ul>
<li>Hız, hız sınırı, yol numarası ve hız sabitleyici hızı.</li>
<li>Yakıt, menzil ve ortalama tüketim; 15 km sürdükten sonra kendi sürüşünden ölçülür (o zamana kadar oyunun değeri).</li>
<li><b>Yolculuk</b>: çıkış ve varış, yük, oyun içi varış, gerçek dakikalarla <b>gerçek varış</b>, sonraki şehir, oyun saati, iş teslim süresi, yorgunluğunla birlikte sonraki mola ve iş ücreti. Ücret kendi para biriminde de gösterilebilir.</li>
<li><b>Kamyon</b>: model, kilometre sayacı, her parçanın aşınması ve düşük hava basıncı, yüksek su veya yağ sıcaklığı, zayıf akü gibi uyarılar.</li>
<li><b>Oturum</b>: ödenen geçiş ücretleri, cezalar ve feribot ya da tren yolculukları; sıfırlama düğmesiyle.</li>
</ul>
<h3>Göstergeler sekmesi</h3>
<p>Hız göstergesi, vitesle birlikte devir saati, yakıt çubuğu, kilometre sayacı ve menzil.</p>
<h3>Mini-HUD</h3>
<p>Paneli üç çizgili düğmeyle gizle, harita tüm ekranı kaplasın; hızın ve hız sınırı bir köşede kalır. Mini-HUD'un başka neler göstereceğini Ayarlar'da seçersin: yakıt, menzil, varış süresi, kalan mesafe, yorgunlukla sonraki mola, hız sabitleyici ve GPS yönlendirmeleri.</p>`,
    dash: `
<p>Üst çubuktaki gösterge düğmesi tam ekran bir gösterge paneli açar:</p>
<ul>
<li>Nerede dinlenmen gerekeceğini işaretleyen bir rota çubuğu.</li>
<li>Teslim süresine göre erken mi geç mi kaldığın ve km başına ücret.</li>
<li>Yakıtın varışa yetip yetmediği ve AdBlue.</li>
<li>Kamyon ve dorsenin her parçasının hasarı ve yük hasarı.</li>
<li>Yağ, su ve fren sıcaklıkları, hava ve yağ basıncı, akü voltajı.</li>
<li>Uyarı lambaları: farlar, sinyaller, dörtlüler, tepe lambası, silecekler, motor freni, retarder, diferansiyel kilidi, el freni, kaldırma dingili ve dorse.</li>
<li>Oturum toplamları: sürülen mesafe, direksiyonda geçen süre, ortalama ve azami hız, harcanan yakıt ve net kazanç.</li>
</ul>
<p>S, M ve L boyutu değiştirir; X haritaya döner.</p>
<h3>İkinci ekranda</h3>
<p>Başka bir cihazda (tablet, eski bir telefon, ikinci monitör) <a href="/dash/">trucksim-dash.com/dash</a> adresini aç ve aynı eşleştirme kodunu yaz. GPS ve gösterge paneli aynı anda çalışabilir. Ayarlar'da <b>Panel bağlantısını kopyala</b> düğmesi var.</p>`,
    buttons: `
<p>Haritadaki oyun kolu düğmesi bir sıra kamyon komutu açar. Birine dokun, bilgisayarındaki istemci oyunda tuşa senin yerine basar.</p>`,
    settings: `
<p>Dişli düğmesi Ayarlar'ı açar:</p>
<ul>
<li><b>Birimler</b> (km veya mil) ve <b>dil</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: bilgi paneli gizliyken ne gösterileceği.</li>
<li><b>Yakındaki diğer sürücüler</b>: konumunu paylaş ya da diğerlerinin işaretlerini gizle.</li>
<li><b>Harita düğmeleri</b>: haritaya uyan koyu stil, sürerken soluklaştırma (dokununca geri gelir) ve <b>Düğmeleri taşı</b>: herhangi bir düğmeyi veya paneli sürükle, köşesinden boyutunu değiştir; ızgara ve Sıfırla ile.</li>
<li><b>Gerçek altlık harita</b>: yolların altında kıyı şeridi, göller, nehirler ve yerleşim alanları (yaklaşık 1 MB daha).</li>
<li><b>Hafif mod</b> eski telefonlar ve tabletler için: daha hafif çizim ve istersen hiç rota hesaplamadan, en fazla belleği korumak için.</li>
<li><b>Rota tercihi</b>: en hızlı veya en kısa.</li>
<li><b>Kendi para biriminde ücret</b>, oyunun € veya $ değerinin yanında.</li>
<li><b>Rota çizgisi rengi</b>: kırmızı, mavi veya yeşil.</li>
<li><b>Navigasyon modunda harita yakınlaştırması</b>.</li>
<li><b>Sesli yönlendirme</b>: navigasyon modunda her dönüşü önceden ve dönüşte tekrar, ayrıca varışı, yol adları olmadan söyler. Türkçede cihazının sesini kullanır.</li>
<li>Düğme kutusu için <b>Tuş ata</b>.</li>
<li><b>Başka bir cihazda gösterge paneli</b>: bağlantısını kopyala.</li>
<li><b>Yolculuk geçmişi</b>: teslimatların, yalnızca bu cihazda saklanır.</li>
<li><b>Sorun bildir</b>, yol haritası ve sürüm notları.</li>
</ul>
<p>Dar bir telefonda üst çubuktaki bazı düğmeler Ayarlar'a taşınır.</p>
<div class="tip"><p>Her teslimat ayrıca <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> sunucumuzdaki <b>#jobs</b> kanalında paylaşılır: rota, kamyon, yük, mesafe ve ücret; isim veya hesap olmadan.</p></div>`,
    convoy: `
<p>Arkadaşlarınla sür ve birbirinizi haritada görün. Herkes kendi oyununu ve istemcisini kullanır: aynı çok oyunculu oturumda olmanız gerekmez.</p>
<ul>
<li>Üst çubuktaki konvoy düğmesini aç, bir takma ad seç ve <b>Konvoy oluştur</b>, ya da bir arkadaşının 6 karakterli kodunu yaz ve <b>Katıl</b>. <b>Bağlantıyı kopyala</b> ve Discord'a yapıştır.</li>
<li>Üyeler haritada ve bir kart sırasında görünür: sana olan uzaklıkları, yolculukları ve paylaşmayı seçerlerse ücretleri.</li>
<li><b>Lideri takip et</b> ve birinin nereye gittiğini görmek için <b>Rotayı göster</b>.</li>
<li>Haritadan <b>hızlı mesajlar</b>: Her şey yolunda, Sonraki dinlenme alanında dur, Yakıt lazım, Geride kalıyorum, Beni bekleyin, Hadi gidelim.</li>
<li>Oyunu olmayan arkadaşlar bağlantıyı açıp izleyebilir.</li>
<li>İstersen konvoy bittiğinde Truck Dash Discord'unda bir özet paylaşılır. Sonrasında hiçbir şey saklanmaz.</li>
</ul>
<p>Konvoy, aynı Wi-Fi adresi değil, internet bağlantısı (eşleştirme koduyla trucksim-dash.com/app) gerektirir.</p>`,
    client: `
<p>Saatin yanındaki tepsi simgesine sağ tıkla:</p>
<ul>
<li><b>Kurulum ve durum</b>: eşleştirme kodu, QR koduyla aynı Wi-Fi adresi, her oyun için eklenti (Steam kurulumları kendiliğinden bulunur; diğerleri için <b>Oyun klasörü ekle</b>) ve seçenekler.</li>
<li><b>Seçenekler</b>: Windows ile başlat (oyun başlayınca gösterge panelini açar), yolculuğunu Discord profilinde göster, oyun kapanınca Truck Dash'i kapat ve açılışta gösterge panelini tarayıcıda aç.</li>
<li><b>Eşleştirme kodunu göster</b> ve sana yeni bir kod veren <b>Bağlantıyı kes</b>.</li>
<li><b>Güncellemeleri denetle</b>. İstemci ve uygulama yeni bir sürüm çıktığında da haber verir.</li>
<li><b>Günlük dosyasını göster</b> ve <b>Sorun bildir</b>.</li>
</ul>
<div class="tip"><p>Bir şey çalışmıyor mu? <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> sunucumuzda sor ve günlük dosyasını ekle: sorunların çoğu birkaç mesajda çözülür.</p></div>`,
    account: `
<p>Bir hesap sürüş geçmişini saklar: sürdüğün her iş, haritadaki rotasıyla. İsteğe bağlı ve ücretsizdir; Truck Dash'in geri kalanı hesapsız da aynı şekilde çalışır.</p>
<ol>
<li><a href="/account/">trucksim-dash.com/account</a> adresinde Discord, Google veya bir e-posta ve şifreyle giriş yap. E-postayla giriş yaparsan adresi doğrulamak için 6 haneli bir kod göndeririz.</li>
<li>İstemcide <b>Kurulum ve durum</b>u aç ve <b>Hesap bağla</b>ya tıkla. Tarayıcıda bir sayfa açılır: onayla, istemci bağlanmış olur.</li>
</ol>
<p>Bundan sonra her iş teslim ettiğinde veya iptal ettiğinde kaydedilir: hıza göre renklendirilmiş rota, mesafe (oyununki ve bizim ölçtüğümüz), kazanç, yakıt, geçiş ücretleri, cezalar, hasar, sürüş süresi ve uyku saatleri, zamanında mı geç mi, ve geçtiğin ülkeler veya eyaletler. Hesabında seyir defteri (CSV dışa aktarma ile), her oyun için istatistikler, rekorlar ve başarımlar var. Sistem tepsisi menüsündeki <b>Hesabım</b> seni oraya götürür.</p>
<h3>Bilmekte fayda var</h3>
<ul>
<li>İstemciyi bağlayana kadar hiçbir şey kaydedilmez. Profilin, <b>Ayarlar</b>'dan herkese açık yapmadığın sürece gizlidir.</li>
<li><b>Takip</b> bölümünden diğer sürücüleri kullanıcı adıyla takip edebilirsin. Onaylamaları gerekir; kabul ettiğin kişiler profilin gizli olsa bile seferlerini rotalarıyla, sürerken nerede olduğunu ve başarımlarını görür. Notların sende kalır.</li>
<li>Bir işi Truck Dash kapalıyken teslim edersen teslimatı göremeyiz ve sefer <b>tamamlanmadı</b> olarak görünür. İptal edildi olarak işaretleyebilirsin, ama teslimatı yalnızca oyun bildirebilir.</li>
<li>Bir süre internetin mi yok? Hiçbir şey kaybolmaz: istemci seferi saklar ve bağlantı gelince gönderir.</li>
<li>Para modu kullanılan işler işaretlenir ve para toplamlarına katılmaz.</li>
<li><b>Ayarlar</b>'dan tüm verilerini indirebilir veya hesabını silebilirsin.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Bir düğme, o şey kamyonunda açıkken <b>maviye</b> döner (motor çalışıyor, farlar açık, dorse bağlı, hız sabitleyici ayarlı); yani sıra aynı zamanda bir durum paneli.</p>
<h3>Tuşların</h3>
<p>Düğmeler hazır tuşlarla gelir. Oyunda kontrolleri değiştirdiysen Ayarlar'da <b>Tuş ata</b> ile aynısını yap. Bir düğmeyi kapatmak için tuşunu boş bırak.</p>
<h3>Özel düğmeler</h3>
<p><b>Düğme ekle</b> ile kendine ait en fazla 3 düğme oluştur: bir ad ver ve tuşa bas (Ctrl, Shift ve Alt kombinasyonları, F1-F24 ve sayısal tuş takımı çalışır). Sonra aynı tuşu oyunun kontrollerinde istediğin şeye ata: diferansiyel kilidi, retarder, korna, radyo.</p>
<div class="tip"><p>Telefon dikken düğme kutusu bilgi panelinin bir sayfasıdır: ona kaydır. İstemci, oyun açıkken çalışıyor olmalı; demoda düğmeler bir şey yapmaz.</p></div>`,
  },
  ic: {
    recenterBtn: ['Ortala', 'Kamyonuna ve navigasyon yakınlaştırmana döner.'],
    fullscreenBtn: ['Tam ekran', 'Üst çubuğu ve telefonun çubuklarını gizler.'],
    navToggleBtn: ['Navigasyon modu', 'Harita seninle döner, dönüşlerde yakınlaşır ve yön gösterir.'],
    tilt3dBtn: ['3B görünüm', 'Eğik görünüm, navigasyon modunda.'],
    waypointBtn: ['Ara nokta', 'Dokun, sonra haritaya dokun. En fazla 9.'],
    commandsToggleBtn: ['Düğme kutusu', 'Kamyon komutları: farlar, motor, dörtlüler ve daha fazlası.'],
    convoyMsgBtn: ['Konvoy mesajı', 'Konvoydayken hızlı mesajlar.'],
    panelToggleBtn: ['Bilgi paneli', 'Gösterir veya gizler; gizliyken mini-HUD devreye girer.'],
    poiBtn: ['Yakında ara', 'Yakıt, dinlenme, servis, şirketler ve daha fazlası.'],
    dashBtn: ['Gösterge paneli', 'Tam ekran göstergeler.'],
    settingsBtn: ['Ayarlar', 'Yukarıdaki listedeki her şey.'],
    helpBtn: ['Hızlı tur', 'Ekranın tanıtım turunu yeniden gösterir.'],
    unitToggle: ['Birimler', 'Kilometre veya mil.'],
    langSelect: ['Dil', 'Sekiz dil.'],
    modsBtn: ['Harita modları', 'Oyundan algılanır veya elle seçilir.'],
    convoyBtn: ['Konvoy', 'Arkadaşlarla sürüş.'],
    discordBtn: ['Discord', 'Topluluk: yardım, fikirler ve #jobs.'],
  },
  cmd: {
    cmdHazards: 'Dörtlüler', cmdBeacon: 'Tepe lambası', cmdHandbrake: 'El freni', cmdEngine: 'Motor',
    cmdTrailer: 'Dorse', cmdCamera: 'Kamera', cmdCruise: 'Hız sabitleyici', cmdLights: 'Farlar',
    cmdHighBeam: 'Uzun farlar', cmdInfotainment: 'Bilgi-eğlence', cmdLiftAxle: 'Kaldırma dingili', cmdWipers: 'Silecekler',
    add: 'Düğme ekle',
  },
};

GUIDE_TEXT.ru = {
  title: 'Руководство',
  lead: 'Всё, что умеет Truck Dash, экран за экраном. Truck Dash — бесплатный GPS и панель приборов для Euro Truck Simulator 2 и American Truck Simulator на телефоне, планшете или втором мониторе. Аккаунт не нужен.',
  openApp: 'Открыть приложение',
  demo: 'Попробовать демо',
  toc: 'Содержание',
  backTop: 'Наверх',
  privacy: 'Конфиденциальность',
  support: 'Поддержать',
  h: {
    start: 'Начало работы',
    status: 'Индикатор состояния',
    gps: 'GPS',
    panel: 'Панель информации',
    dash: 'Панель приборов',
    buttons: 'Кнопки грузовика',
    settings: 'Настройки и верхняя панель',
    convoy: 'Конвой (бета)',
    client: 'Клиент на вашем ПК',
    account: 'Ваш аккаунт (необязательно)',
  },
  legend: { gps: 'Кнопки на карте', settings: 'Верхняя панель' },
  cap: {
    map: 'Горизонтально: карта с маршрутом, панель информации и кнопки грузовика.',
    phone: 'Режим навигации на телефоне.',
    dash: 'Панель приборов на весь экран.',
  },
  b: {
    start: `
<ol>
<li>Скачайте клиент с <a href="/">trucksim-dash.com</a> и запустите <code>TruckDash.exe</code> на ПК, где вы играете. Он работает в области уведомлений, рядом с часами.</li>
<li>Щёлкните значок правой кнопкой, откройте <b>Настройка и состояние</b> и нажмите <b>Установить плагин</b> для своей игры. Если игра была открыта, перезапустите её.</li>
<li>На телефоне откройте <a href="/app/">trucksim-dash.com/app</a> и введите <b>код сопряжения</b>, который показывает клиент. Телефону не обязательно быть в той же сети Wi-Fi.</li>
</ol>
<p>Неиспользованный код истекает через 10 минут. После подключения сессия длится, пока вы не закроете клиент.</p>
<h3>Та же сеть Wi-Fi: минимальная задержка</h3>
<p>В окне «Настройка и состояние» также есть локальный адрес и QR-код. Отсканируйте его телефоном, и всё: без кода сопряжения, и работает даже без интернета. Windows один раз спросит разрешение в брандмауэре.</p>
<div class="tip"><p>В браузере телефона выберите <b>Добавить на главный экран</b>: Truck Dash будет открываться на весь экран, как приложение.</p></div>
<p>Игры нет под рукой? <a href="/app/?demo=1">Демо</a> показывает рейс на настоящей карте ATS.</p>`,
    status: `
<p>Индикатор в левом верхнем углу приложения показывает, что происходит на каждом шаге:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Клиент не запущен</b>: запустите TruckDash.exe на ПК или проверьте его значок в области уведомлений.</span></li>
<li><span class="dot"></span><span><b>Ожидание игры</b>: клиент подключён; откройте ETS2 или ATS.</span></li>
<li><span class="dot bad"></span><span><b>Плагин не установлен</b>: игра открыта, но данные не приходят. «Настройка и состояние», «Установить плагин», затем перезапустите игру.</span></li>
<li><span class="dot"></span><span><b>В меню</b>: сядьте в грузовик, и данные начнут поступать.</span></li>
<li><span class="dot ok"></span><span><b>Онлайн</b>: всё в порядке. Когда игра на паузе, видно <b>Пауза</b>.</span></li>
<li><span class="dot bad"></span><span><b>Неверный или истёкший код</b>: получите новый через значок, <b>Показать код сопряжения</b>.</span></li>
</ul>`,
    gps: `
<p>Маршрут до пункта назначения заказа рисуется <b>автоматически</b>, как только вы берёте заказ: быстрые заказы и биржа грузов, включая перевозку автомобилей из Road Trip: Ford (клиент 1.5.21 или новее). Он учитывает ваш выбор в настройках: самый быстрый, как GPS в игре, или самый короткий.</p>
<p><b>Сводка маршрута</b> внизу карты показывает оставшееся расстояние, оставшееся время и время прибытия с полосой прогресса. Стрелка сворачивает её в тонкую полосу прогресса (нажмите на полосу, чтобы развернуть), а кнопка с перечёркнутым маршрутом убирает маршрут с карты.</p>
<h3>Режим навигации</h3>
<p>Карта поворачивается по направлению движения, приближается перед поворотами и показывает подсказки сверху, например <i>Держитесь правее на I-15 в сторону Provo</i>. Насколько близко она следует за вами, выбирается в настройках. Масштабировать двумя пальцами по-прежнему можно; кнопка центрирования вернёт вид.</p>
<h3>Путевые точки</h3>
<p>Нажмите на флажок, затем на место на карте, до 9 остановок. Приложение спросит, поставили ли вы эту точку и в GPS игры:</p>
<ul>
<li><b>Да</b>: ETA игры уже учитывает объезд, приложение только рисует маршрут через точку.</li>
<li><b>Нет</b>: приложение само считает расстояние и время через точку и показывает их как <i>через путевую точку</i> под ETA.</li>
</ul>
<h3>Найти рядом</h3>
<p>Лупа находит заправки, стоянки для отдыха, сервисы, гаражи, дилеров грузовиков и весовые пункты рядом с вами, а также любую компанию или город. Нажмите на результат, и маршрут пройдёт через это место. <b>Ближайшая заправка</b> находится одним нажатием.</p>
<h3>Ещё на карте</h3>
<ul>
<li><b>Синяя линия</b> за грузовиком показывает, где вы проехали.</li>
<li>С включённым <b>Делиться моей позицией</b> вы видите других водителей Truck Dash на своей карте и анонимно отображаетесь на публичной <a href="/live/">живой карте</a>, вместе с вашим маршрутом, если не снять галочку <b>Показывать и мой маршрут на живой карте</b>. Это отключается в настройках.</li>
<li>У <b>модов карт</b> свои карты: ProMods, Coast to Coast, ProMods Canada, Reforma, RusMap, Roextended, Grand Utopia и TruckersMP. Приложение определяет их по игре, или вы выбираете вручную кнопкой с пазлом.</li>
<li><b>DLC</b> (в Настройках): снимите отметки с картографических DLC, которых у вас нет, и маршруты будут объезжать их дороги. Если объезда нет, маршрут всё равно пройдёт по ним и предупредит. С клиентом 1.5.28 и новее они читаются из игры сами.</li>
</ul>
<p>Любую кнопку на карте можно переместить и изменить её размер: удерживайте её на телефоне или выберите <b>Переместить кнопки</b> в настройках.</p>`,
    panel: `
<p>Рядом с картой в горизонтальном положении, под ней на телефоне в вертикальном (листайте вбок, чтобы увидеть другие страницы).</p>
<h3>Вкладка «Данные»</h3>
<ul>
<li>Скорость, ограничение скорости, номер дороги и скорость круиз-контроля.</li>
<li>Топливо, запас хода и средний расход, измеренный по вашей езде после первых 15 км (до этого значение из игры).</li>
<li><b>Рейс</b>: откуда и куда, груз, ETA по игровому времени, <b>ETA (реальное)</b> в настоящих минутах, следующий город, игровое время, срок заказа, следующий отдых с уровнем усталости и оплата. Оплату можно показывать и в вашей валюте.</li>
<li><b>Грузовик</b>: модель, одометр, износ каждой детали и предупреждения: низкое давление воздуха, высокая температура воды или масла, слабый аккумулятор.</li>
<li><b>Сессия</b>: оплаченные платные дороги, штрафы и поездки на пароме или поезде, с кнопкой сброса.</li>
</ul>
<h3>Вкладка «Приборы»</h3>
<p>Спидометр, тахометр с передачей, полоса топлива, одометр и запас хода.</p>
<h3>Мини-HUD</h3>
<p>Скройте панель кнопкой с тремя полосками, и карта займёт весь экран; скорость и ограничение останутся в углу. В настройках вы выбираете, что ещё показывает мини-HUD: топливо, запас хода, ETA, оставшееся расстояние, следующий отдых с усталостью, круиз-контроль и подсказки GPS.</p>`,
    dash: `
<p>Кнопка со спидометром на верхней панели открывает панель приборов на весь экран:</p>
<ul>
<li>Полоса маршрута, на которой отмечено, где придётся отдохнуть.</li>
<li>Опережение или опоздание относительно срока заказа и оплата за км.</li>
<li>Хватит ли топлива до места назначения, и AdBlue.</li>
<li>Повреждения каждой детали грузовика и прицепа, и повреждение груза.</li>
<li>Температура масла, воды и тормозов, давление воздуха и масла, напряжение аккумулятора.</li>
<li>Индикаторы: фары, поворотники, аварийка, маячок, дворники, моторный тормоз, ретардер, блокировка дифференциала, ручник, подъёмная ось и прицеп.</li>
<li>Итоги сессии: пройденное расстояние, время за рулём, средняя и максимальная скорость, израсходованное топливо и чистый доход.</li>
</ul>
<p>S, M и L меняют размер; крестик возвращает к карте.</p>
<h3>На втором экране</h3>
<p>Откройте <a href="/dash/">trucksim-dash.com/dash</a> на другом устройстве (планшет, старый телефон, второй монитор) и введите тот же код сопряжения. GPS и панель приборов могут работать одновременно. В настройках есть кнопка <b>Скопировать ссылку на панель</b>.</p>`,
    buttons: `
<p>Кнопка с геймпадом на карте открывает ряд команд грузовика. Нажмите одну, и клиент на ПК нажмёт нужную клавишу в игре за вас.</p>`,
    settings: `
<p>Шестерёнка открывает настройки:</p>
<ul>
<li><b>Единицы</b> (км или мили) и <b>язык</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Мини-HUD</b>: что показывать, когда панель информации скрыта.</li>
<li><b>Другие водители рядом</b>: делиться своей позицией или скрыть метки других.</li>
<li><b>Кнопки на карте</b>: тёмный стиль под цвет карты, приглушение во время езды (возвращаются при касании) и <b>Переместить кнопки</b>: перетащите любую кнопку или панель, а за угол измените размер; есть сетка и сброс.</li>
<li><b>Настоящая подложка</b>: береговая линия, озёра, реки и застройка под дорогами (примерно на 1 МБ больше).</li>
<li><b>Лёгкий режим</b> для старых телефонов и планшетов: упрощённая отрисовка и, при желании, без расчёта маршрута, чтобы сэкономить больше всего памяти.</li>
<li><b>Предпочтение маршрута</b>: самый быстрый или самый короткий.</li>
<li><b>Оплата в вашей валюте</b> рядом с € или $ из игры.</li>
<li><b>Цвет линии маршрута</b>: красный, синий или зелёный.</li>
<li><b>Масштаб карты в режиме навигации</b>.</li>
<li><b>Голосовые подсказки</b>: в режиме навигации заранее и в момент поворота сообщают о каждом повороте, а также о прибытии, без названий дорог.</li>
<li><b>Назначить клавиши</b> для кнопок грузовика.</li>
<li><b>Панель приборов на другом устройстве</b>: скопировать ссылку.</li>
<li><b>История рейсов</b>: ваши доставки, хранятся только на этом устройстве.</li>
<li><b>Сообщить о проблеме</b>, планы развития и список изменений.</li>
</ul>
<p>На узком телефоне часть кнопок верхней панели переезжает в настройки.</p>
<div class="tip"><p>Каждая доставка также публикуется в канале <b>#jobs</b> нашего <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a>: маршрут, грузовик, груз, расстояние и оплата, без имени и без аккаунта.</p></div>`,
    convoy: `
<p>Ездите с друзьями и видьте друг друга на карте. У каждого своя игра и свой клиент: быть в одной многопользовательской сессии не нужно.</p>
<ul>
<li>Откройте кнопку конвоя на верхней панели, выберите ник и нажмите <b>Создать конвой</b>, или введите 6-символьный код друга и нажмите <b>Войти</b>. <b>Скопировать ссылку</b>, чтобы вставить её в Discord.</li>
<li>Участники видны на карте и в ряду карточек: насколько они далеко, их рейс и оплата, если они решат её показывать.</li>
<li><b>Следовать за лидером</b>, и <b>Показать маршрут</b>, чтобы видеть, куда едет участник.</li>
<li><b>Быстрые сообщения</b> с карты: Всё в порядке, Остановка на следующей стоянке, Нужно топливо, Отстаю, Подождите меня, Поехали.</li>
<li>Друзья без игры могут открыть ссылку и смотреть.</li>
<li>По желанию после окончания конвоя в Discord Truck Dash публикуется итог. После этого ничего не хранится.</li>
</ul>
<p>Конвою нужно подключение через интернет (trucksim-dash.com/app с вашим кодом), а не адрес в той же сети Wi-Fi.</p>`,
    client: `
<p>Щёлкните правой кнопкой по значку в области уведомлений, рядом с часами:</p>
<ul>
<li><b>Настройка и состояние</b>: код сопряжения, адрес для той же сети Wi-Fi с QR-кодом, плагин для каждой игры (установки Steam находятся сами; для остальных <b>Добавить папку игры</b>) и параметры.</li>
<li><b>Параметры</b>: запуск вместе с Windows (открывает панель приборов, когда стартует игра), показ рейса в профиле Discord, закрытие Truck Dash вместе с игрой и открытие панели приборов в браузере при запуске.</li>
<li><b>Показать код сопряжения</b>, и <b>Отключить</b>, что даёт новый код.</li>
<li><b>Проверить обновления</b>. Клиент и приложение также сообщают о выходе новой версии.</li>
<li><b>Показать файл журнала</b> и <b>Сообщить о проблеме</b>.</li>
</ul>
<div class="tip"><p>Что-то не работает? Спросите в нашем <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> и приложите файл журнала: большинство проблем решается за пару сообщений.</p></div>`,
    account: `
<p>Аккаунт хранит историю ваших поездок: каждый рейс с маршрутом на карте. Он необязателен и бесплатен, а всё остальное в Truck Dash работает так же и без него.</p>
<ol>
<li>Войдите на <a href="/account/">trucksim-dash.com/account</a> через Discord, Google или почту и пароль. При входе по почте мы пришлём 6-значный код для подтверждения адреса.</li>
<li>В клиенте откройте <b>Настройка и состояние</b> и нажмите <b>Привязать аккаунт</b>. В браузере откроется страница: подтвердите, и клиент привязан.</li>
</ol>
<p>С этого момента каждый рейс сохраняется при доставке или отмене: маршрут, раскрашенный по скорости, расстояние (по игре и измеренное нами), оплата, топливо, платные дороги, штрафы, повреждения, время за рулём и часы сна, вовремя или с опозданием, а также страны или штаты, через которые вы проехали. В аккаунте есть журнал (с экспортом в CSV), статистика по каждой игре, рекорды и достижения. <b>Мой аккаунт</b> в меню трея ведёт прямо туда.</p>
<h3>Полезно знать</h3>
<ul>
<li>Ничего не сохраняется, пока вы не привяжете клиент. Профиль закрыт, если вы не сделаете его публичным в <b>Настройках</b>.</li>
<li>В разделе <b>Подписки</b> можно подписаться на других водителей по имени пользователя. Нужно их подтверждение, а те, кого вы приняли, видят ваши рейсы с маршрутом, где вы сейчас едете и ваши достижения, даже если профиль закрыт. Заметки остаются только вашими.</li>
<li>Если вы доставили груз при закрытом Truck Dash, мы не видим доставку, и рейс отображается как <b>не завершён</b>. Его можно отметить как отменённый, но о доставке может сообщить только игра.</li>
<li>Пропал интернет? Ничего не теряется: клиент сохраняет рейс и отправит его, когда связь вернётся.</li>
<li>Рейсы с модом на деньги помечаются и не входят в денежные итоги.</li>
<li>В <b>Настройках</b> можно скачать все свои данные или удалить аккаунт.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Кнопка становится <b>синей</b>, когда эта функция включена в грузовике (двигатель работает, фары включены, прицеп сцеплен, круиз-контроль установлен), так что ряд кнопок служит и панелью состояния.</p>
<h3>Ваши клавиши</h3>
<p>У кнопок есть клавиши по умолчанию. Если вы меняли управление в игре, сделайте то же в настройках, <b>Назначить клавиши</b>. Оставьте поле пустым, чтобы отключить кнопку.</p>
<h3>Свои кнопки</h3>
<p><b>Добавить кнопку</b> создаёт до 3 своих: задайте подпись и нажмите клавишу (работают сочетания с Ctrl, Shift и Alt, а также F1–F24 и цифровой блок). Затем назначьте ту же клавишу на что угодно в управлении игры: блокировку дифференциала, ретардер, гудок, радио.</p>
<div class="tip"><p>На телефоне в вертикальном положении кнопки грузовика — ещё одна страница панели информации: пролистайте до неё. Клиент должен работать при открытой игре; в демо кнопки ничего не делают.</p></div>`,
  },
  ic: {
    recenterBtn: ['Центрировать', 'Возвращает к грузовику и к масштабу навигации.'],
    fullscreenBtn: ['Полный экран', 'Скрывает верхнюю панель и панели телефона.'],
    navToggleBtn: ['Режим навигации', 'Карта поворачивается с вами, приближается на поворотах и даёт подсказки.'],
    tilt3dBtn: ['3D-вид', 'Наклонный вид, в режиме навигации.'],
    waypointBtn: ['Путевая точка', 'Нажмите, затем нажмите на карту. До 9.'],
    commandsToggleBtn: ['Кнопки грузовика', 'Команды: фары, двигатель, аварийка и другое.'],
    convoyMsgBtn: ['Сообщение конвою', 'Быстрые сообщения, пока вы в конвое.'],
    panelToggleBtn: ['Панель информации', 'Показывает или скрывает; скрытую заменяет мини-HUD.'],
    poiBtn: ['Найти рядом', 'Заправки, стоянки, сервисы, компании и другое.'],
    dashBtn: ['Панель приборов', 'Приборы на весь экран.'],
    settingsBtn: ['Настройки', 'Всё из списка выше.'],
    helpBtn: ['Краткий тур', 'Снова показывает тур по экрану.'],
    unitToggle: ['Единицы', 'Километры или мили.'],
    langSelect: ['Язык', 'Восемь языков.'],
    modsBtn: ['Моды карт', 'Определяются по игре или выбираются вручную.'],
    convoyBtn: ['Конвой', 'Езда с друзьями.'],
    discordBtn: ['Discord', 'Сообщество: помощь, идеи и #jobs.'],
  },
  cmd: {
    cmdHazards: 'Аварийка', cmdBeacon: 'Маячок', cmdHandbrake: 'Ручник', cmdEngine: 'Двигатель',
    cmdTrailer: 'Прицеп', cmdCamera: 'Камера', cmdCruise: 'Круиз', cmdLights: 'Фары',
    cmdHighBeam: 'Дальний свет', cmdInfotainment: 'Инфотейнмент', cmdLiftAxle: 'Подъёмная ось', cmdWipers: 'Дворники',
    add: 'Добавить кнопку',
  },
};
