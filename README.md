## Multi Sound - Versione Web

Questa è una versione standalone in **HTML/JS/CSS** dell'applicazione Multi Sound, convertita dalla versione desktop Electron.

## Contenuto

- **index.html** - Pagina web con interfaccia dispositivi audio
- **renderer.js** - Logica principale dell'applicazione (compatibile web)
- **styles.css** - Stili grafici (identici all'originale)

## Funzionalità Principali

• Selezione dispositivi audio multi-output  
• Riproduzione file audio locali  
• Supporto streaming HLS  
• Controllo volume per dispositivo  
• Enumerazione dispositivi e routing audio  

### Opzione 1: Apertura Diretta File
Apri semplicemente `index.html` nel browser. Tuttavia, la selezione file potrebbe essere limitata a causa delle restrizioni di sicurezza del browser.

### Opzione 2: Versione Web
Vai su multisound.edgeone.app

## Requisiti Browser

- **Browser Chromium moderno** (Chrome, Edge, Brave, ecc.)
- Supporto enumerazione dispositivi audio
- Web Audio API con `setSinkId()` per output multi-dispositivo

### Limitazioni Note

- **Firefox**: Supporto limitato a `setSinkId()` (il routing multi-dispositivo potrebbe non funzionare)
- **Safari**: Supporto limitato per la selezione output audio
- **YouTube**: Il routing audio YouTube verso dispositivi specifici potrebbe non funzionare (limitazione browser)
- **Nessun yt-dlp**: Impossibile estrarre URL audio diretti da YouTube (usa la riproduzione integrata del browser)

## Funzionalità Supportate

• Selezione e riproduzione file locali  
• Navigazione cartelle audio  
• Controllo volume per dispositivo  
• Richiesta permessi dispositivi  

## Struttura

 ```txt
web-version/
├── index.html      # File HTML principale con struttura UI
├── renderer.js     # Logica applicazione
├── styles.css      # Design e layout
└── README.md       # Questo file
