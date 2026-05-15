
const devicesContainer = document.getElementById('devices')
const refreshBtn = document.getElementById('refresh')
const enableBtn = document.getElementById('enableDevices')

let devicePlayers = {}


const isElectron = !!window.api && typeof window.api.chooseFiles === 'function'

// shared AudioContext to satisfy autoplay policies; resumed on first user gesture
const AudioCtx = window.AudioContext || window.webkitAudioContext
let audioCtx = AudioCtx ? new AudioCtx() : null

async function enumerateOutputs() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.warn('Enumerazione dispositivi non supportata in questo ambiente.')
    return []
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  const outputs = devices.filter(d => d.kind === 'audiooutput')

  // Deduplicate outputs by groupId (preferred), then deviceId, then label
  const seen = new Map()
  outputs.forEach(d => {
    const key = d.groupId || d.deviceId || d.label || d.kind
    if (!seen.has(key)) seen.set(key, d)
  })
  return Array.from(seen.values())
}

async function requestDevicePermissions() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('getUserMedia non supportato dal browser.')
    return false
  }
  try {
    // richiede accesso al microfono per permettere al browser di esporre label/deviceId
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // rilascia subito il microfono
    stream.getTracks().forEach(t => t.stop())
    return true
  } catch (e) {
    console.warn('Permesso dispositivi negato', e)
    return false
  }
}

function createDeviceCard(device) {
  // key uses groupId when available to avoid duplicates for the same physical device
  const key = device.groupId || device.deviceId || device.label || device.kind
  if (devicePlayers[key]) return null // already created

  const el = document.createElement('div')
  el.className = 'device'
  el.innerHTML = `
    <h2>${device.label || 'Default output'}</h2>
    <div class="row controls">
      <button class="choose-files">Scegli file</button>
      <button class="choose-folder secondary">Scegli cartella</button>
      <button class="play">Play</button>
      <button class="pause secondary">Pause</button>
      <button class="stop secondary">Stop</button>
    </div>
    <div style="margin-top:8px">
      <input type="range" min="0" max="1" step="0.01" class="volume">
    </div>
    <div class="playlist"></div>
  `

  const chooseFilesBtn = el.querySelector('.choose-files')
  const chooseFolderBtn = el.querySelector('.choose-folder')
  const playBtn = el.querySelector('.play')
  const pauseBtn = el.querySelector('.pause')
  const stopBtn = el.querySelector('.stop')
  const volSlider = el.querySelector('.volume')
  const playlistEl = el.querySelector('.playlist')
  const statusEl = document.createElement('div')
  statusEl.className = 'status'
  statusEl.textContent = 'Idle'
  el.appendChild(statusEl)

  // add icons and titles to buttons for clarity
  chooseFilesBtn.innerHTML = '<span class="btn-icon">📁</span><span class="label">Scegli file</span>'
  chooseFilesBtn.title = 'Seleziona uno o più file audio per questo dispositivo'
  chooseFolderBtn.innerHTML = '<span class="btn-icon">📂</span><span class="label">Scegli cartella</span>'
  chooseFolderBtn.title = 'Seleziona una cartella con file audio'
  playBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="label">Play</span>'
  playBtn.title = 'Avvia riproduzione per questo dispositivo'
  pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="label">Pause</span>'
  pauseBtn.title = 'Metti in pausa'
  stopBtn.innerHTML = '<span class="btn-icon">⏹️</span><span class="label">Stop</span>'
  stopBtn.title = 'Ferma e riporta all\'inizio'

  // enhance volume UI: icon + slider + percent label
  const volContainer = volSlider.parentElement
  const volRow = document.createElement('div')
  volRow.className = 'volume-row'
  const volIcon = document.createElement('div')
  volIcon.className = 'vol-icon'
  volIcon.textContent = '🔊'
  const volLabel = document.createElement('div')
  volLabel.className = 'vol-label'
  volLabel.textContent = '100%'
  volSlider.classList.add('volume')
  volRow.appendChild(volIcon)
  volRow.appendChild(volSlider)
  volRow.appendChild(volLabel)
  volContainer.innerHTML = ''
  volContainer.appendChild(volRow)

  // player state
  const audio = new Audio()
  const player = {
    key,
    deviceId: device.deviceId,
    groupId: device.groupId,
    audio,
    playlist: [],
    index: 0
  }

  // attempt to set sinkId (works in Chromium-based browsers/Electron when supported)
  if (audio.setSinkId && player.deviceId) {
    audio.setSinkId(player.deviceId).catch(err => {
      console.warn('setSinkId failed', err)
    })
  }

  volSlider.value = 1
  volSlider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value)
    audio.volume = v
    volLabel.textContent = Math.round(v * 100) + '%'
    if (v === 0) volIcon.textContent = '🔈'
    else if (v < 0.5) volIcon.textContent = '🔉'
    else volIcon.textContent = '🔊'
  })

  chooseFilesBtn.addEventListener('click', async () => {
    if (isElectron) {
      const files = await window.api.chooseFiles()
      if (files && files.length) addFilesToPlaylist(player, files, playlistEl)
    } else {
      const files = await chooseFilesWeb()
      if (files && files.length) addFilesToPlaylist(player, files, playlistEl)
    }
  })

  chooseFolderBtn.addEventListener('click', async () => {
    if (isElectron) {
      const files = await window.api.chooseFolder()
      if (files && files.length) addFilesToPlaylist(player, files, playlistEl)
    } else {
      const files = await chooseFolderWeb()
      if (files && files.length) addFilesToPlaylist(player, files, playlistEl)
    }
  })

  // reset button: clear playlist, revoke object URLs, stop audio
  const resetBtn = document.createElement('button')
  resetBtn.className = 'reset'
  resetBtn.textContent = 'Reset'
  resetBtn.style.marginLeft = '6px'
  resetBtn.addEventListener('click', () => {
    // stop audio
    try { audio.pause(); audio.currentTime = 0 } catch(e){}
    // revoke object URLs created for this player's playlist
    player.playlist.forEach(it => {
      if (it.revoke && it.src) {
        try { URL.revokeObjectURL(it.src) } catch(e){}
      }
    })
    // destroy youtube player if present
    if (player.ytPlayer) {
      try { player.ytPlayer.destroy() } catch(e){}
      player.ytPlayer = null
      const ytCont = el.querySelector('.yt-container')
      if (ytCont) ytCont.remove()
    }
    player.playlist = []
    player.index = 0
    try { audio.removeAttribute('src'); audio.load() } catch(e){}
    // clear UI
    playlistEl.innerHTML = ''
    statusEl.textContent = 'Reset'
  })
  el.querySelector('.controls').appendChild(resetBtn)

  // debug button
  const debugBtn = document.createElement('button')
  debugBtn.className = 'secondary'
  debugBtn.textContent = 'Debug'
  debugBtn.title = 'Esegue controlli di reachability/CORS per la sorgente corrente'
  debugBtn.style.marginLeft = '6px'
  debugBtn.addEventListener('click', async () => {
    const current = player.playlist[player.index]
    await debugSource(current, player, el)
  })
  el.querySelector('.controls').appendChild(debugBtn)



  playBtn.addEventListener('click', async (ev) => {
    // resume shared AudioContext if present
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume() } catch (e) { console.warn('AudioContext resume failed', e) }
    }

    if (!player.playlist.length && !player.ytPlayer) {
      statusEl.textContent = 'Nessun file'
      return
    }
    // if this player has a YouTube player, control it
    if (player.ytPlayer) {
      try { player.ytPlayer.playVideo(); statusEl.textContent = 'Playing (YouTube)'; } catch(e){console.warn('yt play failed',e)}
      return
    }
    const next = player.playlist[player.index]
    const nextSrc = next && next.src
    if (!nextSrc) {
      // try File fallback automatically if available
      if (next && next.file) {
        statusEl.textContent = 'Preparazione sorgente...'
        const reader = new FileReader()
        reader.onload = () => {
          try {
            audio.src = reader.result
            audio.load()
            audio.play().catch(e => console.warn('play after dataURL failed', e))
          } catch(e) { console.warn('setting dataURL failed', e) }
        }
        reader.onerror = (e) => { console.warn('FileReader error', e); statusEl.textContent = 'Errore nella lettura del file' }
        reader.readAsDataURL(next.file)
        return
      }
      statusEl.textContent = 'Nessuna sorgente valida'
      return
    }
    // set audio src explicitly
    if (audio.src !== nextSrc) {
      audio.src = nextSrc
    }
    try {
      statusEl.textContent = 'Loading...'
      const p = audio.play()
      if (p && p.then) {
        p.then(() => { statusEl.textContent = 'Playing' })
         .catch(err => {
          console.warn('Audio play rejected', err)
          statusEl.textContent = 'Errore riproduzione'
          alert('Impossibile riprodurre: ' + (err && err.message ? err.message : 'Errore riproduzione'))
        })
      }
    } catch (err) {
      console.warn('Play error', err)
      statusEl.textContent = 'Errore'
    }
  })
  audio.addEventListener('playing', () => { statusEl.textContent = 'Playing' })
  pauseBtn.addEventListener('click', () => audio.pause())
  stopBtn.addEventListener('click', () => { audio.pause(); audio.currentTime = 0 })
  // wire pause/stop to YouTube if needed
  pauseBtn.addEventListener('click', () => { if (player.ytPlayer) try{ player.ytPlayer.pauseVideo() }catch(e){} })
  stopBtn.addEventListener('click', () => { if (player.ytPlayer) try{ player.ytPlayer.stopVideo() }catch(e){} })

  audio.addEventListener('ended', () => {
    statusEl.textContent = 'Ended'
    player.index++
    if (player.index < player.playlist.length) {
      audio.src = player.playlist[player.index].src
      audio.play().catch(e => console.warn('play next failed', e))
    }
  })

  audio.addEventListener('error', (ev) => {
    const err = audio.error
    if (err) {
      // Ignore EMPTY_SRC errors when there is no current playable item
      if (err.code === 4) {
        const cur = player.playlist[player.index]
        if (!cur || !cur.src) {
          // benign empty-src, ignore
          console.debug('Ignored MEDIA_ELEMENT_ERROR_EMPTY_SRC for player', key)
          return
        }
      }
    }
    let msg = 'Unknown audio error'
    if (err) {
      msg = `Code ${err.code} - ${err.message || ''}`
    }
    console.warn('Audio element error', err, ev)
    statusEl.textContent = 'Errore: ' + msg
    // attempt a reload attempt (cache-bust) for object URLs or file urls
    try {
      const cur = audio.src
      if (cur) {
        // if the current playlist item has a File, try diagnostics and reading it as data URL as fallback
        const currentItem = player.playlist[player.index]
        if (currentItem && currentItem.file) {
          // revoke object URL if any
          if (currentItem.revoke && currentItem.src) {
            try { URL.revokeObjectURL(currentItem.src) } catch(e){}
          }
          const file = currentItem.file
          // show basic diagnostics in status and console
          statusEl.textContent = `Errore file: ${file.name} (${file.type || 'unknown'}) ${file.size} bytes`
          console.group('Audio file diagnostics')
          console.log('name:', file.name)
          console.log('type:', file.type)
          console.log('size:', file.size)
          // read first 256 bytes
          const readerHex = new FileReader()
          readerHex.onload = () => {
            try {
              const ab = readerHex.result
              const view = new Uint8Array(ab.slice(0, 256))
              const hex = Array.from(view).slice(0,64).map(b => b.toString(16).padStart(2,'0')).join(' ')
              console.log('first bytes (hex, up to 64):', hex)
              console.groupEnd()
            } catch(e) { console.warn('diag read fail', e) }
          }
          readerHex.onerror = (e) => { console.warn('FileReader diag error', e) }
          readerHex.readAsArrayBuffer(file.slice(0, 256))

          const reader = new FileReader()
          reader.onload = () => {
            try {
              audio.src = reader.result
              audio.load()
              audio.play().catch(e => console.warn('play after dataURL failed', e))
            } catch(e) { console.warn('setting dataURL failed', e) }
          }
          reader.onerror = (e) => { console.warn('FileReader error', e) }
          reader.readAsDataURL(file)
        } else {
          // generic cache-bust reload
          audio.src = ''
          setTimeout(() => {
            audio.src = cur + (cur.indexOf('?') === -1 ? '?_=' + Date.now() : '&_=' + Date.now())
            audio.load()
          }, 200)
        }
      }
    } catch (e) { /* ignore */ }
  })

  devicePlayers[key] = player

  return el
}

function isYouTubeUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')
  } catch (e) { return false }
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    if (u.searchParams.has('v')) return u.searchParams.get('v')
    // look for /embed/ or /watch/
    const p = u.pathname.split('/').filter(Boolean)
    const embedIdx = p.indexOf('embed')
    if (embedIdx !== -1 && p[embedIdx+1]) return p[embedIdx+1]
    return null
  } catch(e){return null}
}

// load YouTube IFrame API once
let _ytAPIPromise = null
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (_ytAPIPromise) return _ytAPIPromise
  _ytAPIPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.onload = () => {
      // The API sets window.onYouTubeIframeAPIReady
    }
    tag.onerror = (e) => reject(e)
    document.head.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => { resolve(); window.onYouTubeIframeAPIReady = null }
  })
  return _ytAPIPromise
}


// load Hls.js dynamically
let _hlsPromise = null
function loadHls() {
  if (window.Hls) return Promise.resolve()
  if (_hlsPromise) return _hlsPromise
  _hlsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
    s.async = true
    s.onload = () => { resolve() }
    s.onerror = (e) => { reject(e) }
    document.head.appendChild(s)
  })
  return _hlsPromise
}

async function handleUrlForPlayer(player, url, playlistEl, cardEl) {
  // normalize
  url = (url || '').trim()
  // If it's a YouTube URL, embed the video using YouTube IFrame API

  async function debugSource(item, player, cardEl) {
    const statusEl = cardEl.querySelector('.status')
    if (!item || !item.src) {
      statusEl.textContent = 'Nessuna sorgente da debug'
      return
    }
    const src = item.src
    statusEl.textContent = 'Debug: testing URL...'
    console.group('Debug source')
    console.log('src:', src)
    try {
      // Try a CORS GET to inspect headers (may fail due to CORS)
      const controller = new AbortController()
      const to = setTimeout(() => controller.abort(), 8000)
      const resp = await fetch(src, { method: 'GET', mode: 'cors', signal: controller.signal })
      clearTimeout(to)
      console.log('fetch ok:', resp.status, resp.statusText)
      console.log('content-type:', resp.headers.get('content-type'))
      console.log('content-length:', resp.headers.get('content-length'))
      statusEl.textContent = `Debug: reachable (${resp.status}) ${resp.headers.get('content-type') || ''}`
      // if HLS manifest, show first line
      const ct = resp.headers.get('content-type') || ''
      if (/application\/vnd\.apple\.mpegurl|application\/x-mpegURL|vnd\.apple\.mpegurl|mpegurl|application\/octet-stream/i.test(ct) || src.endsWith('.m3u8')) {
        const text = await resp.text()
        console.log('manifest preview:\n', text.split('\n').slice(0,20).join('\n'))
      }
    } catch (e) {
      console.warn('fetch failed or CORS blocked', e)
      statusEl.textContent = 'Debug: fetch failed (CORS or network) – vedi Console'
    }
    // If this is a YouTube embed in card, check iframe load
    const ytCont = cardEl.querySelector('.yt-container, .yt-embed')
    if (ytCont) {
      console.log('YouTube embed present in card')
    }
    console.groupEnd()
  }
  if (isYouTubeUrl(url)) {
    const id = extractYouTubeId(url)
    if (!id) { alert('YouTube URL non riconosciuto'); return }
    // remove existing container if any
    const existing = cardEl.querySelector('.yt-container')
    if (existing) existing.remove()
    const container = document.createElement('div')
    container.className = 'yt-container'
    container.style.marginTop = '10px'
    const playerDiv = document.createElement('div')
    const pid = 'yt-' + Math.random().toString(36).slice(2,9)
    playerDiv.id = pid
    container.appendChild(playerDiv)
    cardEl.appendChild(container)
    // hint about routing
    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = "YouTube embed: l'audio viene riprodotto dall'iframe; il routing a dispositivi specifici potrebbe non funzionare."
    cardEl.appendChild(hint)

    const statusEl = cardEl.querySelector('.status')
    statusEl.textContent = 'Preparazione YouTube...'

    // If running in Electron and yt-dlp helper is exposed, try extracting a direct audio URL first
    if (window.yt && typeof window.yt.getAudioUrl === 'function') {
      statusEl.textContent = 'Estrazione audio via yt-dlp...'
      try {
        const extracted = await window.yt.getAudioUrl(url)
        if (extracted && extracted.trim()) {
          const name = `YouTube-${id}`
          player.playlist = [{ src: extracted, name, revoke: false }]
          playlistEl.innerHTML = ''
          const itemEl = document.createElement('div')
          itemEl.className = 'file-item'
          itemEl.textContent = name
          playlistEl.appendChild(itemEl)
          if (player.audio) {
            try { player.audio.pause(); player.audio.removeAttribute('src'); player.audio.load() } catch(e){}
            player.audio.src = extracted
            player.audio.load()
            player.audio.play().catch(e=>console.warn('YouTube extracted play failed', e))
          }
          statusEl.textContent = 'Riproduzione audio YouTube (extracted)'
          return
        } else {
          statusEl.textContent = 'Estrazione non ha restituito URL; uso embed'
        }
      } catch (e) {
        console.warn('yt-dlp extraction failed', e)
        statusEl.textContent = 'Estrazione yt-dlp fallita; uso embed'
      }
    }

    // load API and create player
      // wait for API but with timeout; if API not available fallback to iframe embed
      try {
        await Promise.race([
          loadYouTubeAPI(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('YT API timeout')), 8000))
        ])
      } catch (err) {
        console.warn('YouTube API load failed or timed out', err)
        // fallback to plain iframe embed
        try {
          const iframe = document.createElement('iframe')
          iframe.className = 'yt-embed'
          iframe.width = '320'
          iframe.height = '180'
          iframe.src = `https://www.youtube.com/embed/${id}?rel=0&autoplay=0&modestbranding=1`
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          iframe.style.marginTop = '10px'
          cardEl.appendChild(iframe)
          statusEl.textContent = 'Embed YouTube (fallback)'
          // add open-in-new-tab helper
          const helper = document.createElement('div')
          helper.className = 'hint'
          helper.innerHTML = `Impossibile caricare API; prova ad aprire il video in una nuova scheda.`
          const openBtn = document.createElement('button')
          openBtn.className = 'secondary'
          openBtn.textContent = 'Apri in YouTube'
          openBtn.style.marginLeft = '8px'
          openBtn.addEventListener('click', () => { window.open(url, '_blank') })
          helper.appendChild(openBtn)
          cardEl.appendChild(helper)
        } catch (e) {
          console.warn('YouTube iframe fallback failed', e)
          statusEl.textContent = 'Errore embed YouTube'
          const helper = document.createElement('div')
          helper.className = 'hint'
          helper.textContent = 'Errore durante il fallback embed. Controlla la Console per dettagli.'
          const openBtn = document.createElement('button')
          openBtn.className = 'secondary'
          openBtn.textContent = 'Apri in YouTube'
          openBtn.style.marginLeft = '8px'
          openBtn.addEventListener('click', () => { window.open(url, '_blank') })
          helper.appendChild(openBtn)
          cardEl.appendChild(helper)
        }
        return
      }

      try {
        if (player.ytPlayer) {
          try { player.ytPlayer.destroy() } catch(e){}
          player.ytPlayer = null
        }
        if (window.YT && window.YT.Player) {
          player.ytPlayer = new YT.Player(pid, {
            height: '180',
            width: '320',
            videoId: id,
            playerVars: { rel: 0, modestbranding: 1 },
            events: {
              onReady: (ev) => { statusEl.textContent = 'YouTube pronto' },
              onStateChange: (ev) => {
                // map states
                const s = ev.data
                if (s === YT.PlayerState.PLAYING) statusEl.textContent = 'Playing (YouTube)'
                else if (s === YT.PlayerState.PAUSED) statusEl.textContent = 'Paused (YouTube)'
                else if (s === YT.PlayerState.BUFFERING) statusEl.textContent = 'Buffering...'
                else if (s === YT.PlayerState.ENDED) statusEl.textContent = 'Ended'
                else statusEl.textContent = 'YouTube state: ' + s
              }
            }
          })
        } else {
          // If YT not available after load, fallback iframe
          const iframe = document.createElement('iframe')
          iframe.className = 'yt-embed'
          iframe.width = '320'
          iframe.height = '180'
          iframe.src = `https://www.youtube.com/embed/${id}?rel=0&autoplay=0&modestbranding=1`
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          iframe.style.marginTop = '10px'
          cardEl.appendChild(iframe)
          statusEl.textContent = 'Embed YouTube (fallback)'
        }
      } catch(e) {
        console.warn('YT.Player creation failed', e)
        statusEl.textContent = 'Errore embed YouTube'
      }
    return
  }

  // HLS streams (.m3u8)
  if (/\.m3u8(\?|$)/i.test(url)) {
    await loadHls()
    try {
      if (player.hls) { try { player.hls.destroy() } catch(e){} }
      if (window.Hls && Hls.isSupported()) {
        player.hls = new Hls()
        player.hls.attachMedia(player.audio)
        player.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          player.hls.loadSource(url)
          player.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            try { player.audio.play().catch(e=>console.warn('HLS play failed',e)) } catch(e){}
          })
        })
        playlistEl.innerHTML = ''
        const itemEl = document.createElement('div')
        itemEl.className = 'file-item'
        itemEl.textContent = url.split('/').pop() || url
        playlistEl.appendChild(itemEl)
        return
      } else {
        // fallback to native src
        console.warn('HLS not supported by Hls.js or browser; falling back to native')
      }
    } catch(e) { console.warn('HLS handling failed', e) }
  }

  // Otherwise assume it's a direct audio/radio stream
  try {
    // set as single-item playlist
    const name = url.split('/').pop().split('?')[0] || url
    player.playlist = [{ src: url, name, revoke: false }]
    playlistEl.innerHTML = ''
    const itemEl = document.createElement('div')
    itemEl.className = 'file-item'
    itemEl.textContent = name
    playlistEl.appendChild(itemEl)
    // assign to audio element and try play
    if (player.audio) {
      try { player.audio.pause(); player.audio.removeAttribute('src'); player.audio.load() } catch(e){}
      player.audio.src = url
      player.audio.load()
      player.audio.play().catch(e => { console.warn('stream play failed', e); /* leave status handling to existing handlers */ })
    }
  } catch (e) {
    console.warn('handleUrlForPlayer failed', e)
    alert('Impossibile usare l\'URL fornito')
  }
}

function toFileUrl(path) {
  let p = path.replace(/\\/g, '/')
  // encode spaces and special chars
  return `file:///` + encodeURI(p)
}

function addFilesToPlaylist(player, files, playlistEl) {
  files.forEach(f => {
    let item
    if (typeof f === 'string') {
      const name = f.split(/[\\/]/).pop()
      const src = toFileUrl(f)
      if (!isPlayableByExtension(name)) {
        alert('Formato non supportato: ' + name)
        console.warn('Unsupported extension for', name)
        return
      }
      item = { src, name, revoke: false }
    } else if (f instanceof File) {
      // for File objects, create object URL and keep original file for fallback
      const url = URL.createObjectURL(f)
      const name = f.name
      item = { src: url, name, revoke: true, file: f }
    } else if (f && f.src) {
      item = f
    } else {
      return
    }

    player.playlist.push(item)
    const el = document.createElement('div')
    el.className = 'file-item'
    el.textContent = item.name
    playlistEl.appendChild(el)
  })
}

function isPlayableByExtension(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const map = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' }
  const mime = map[ext]
  if (!mime) return false
  const a = document.createElement('audio')
  return !!a.canPlayType && a.canPlayType(mime) !== ''
}

function isPlayableFile(file, name) {
  if (file.type) {
    const a = document.createElement('audio')
    if (a.canPlayType && a.canPlayType(file.type) !== '') return true
  }
  return isPlayableByExtension(name)
}

// Web fallback: use hidden inputs to let user select files/folders
function chooseFilesWeb() {
  return new Promise(resolve => {
    const input = document.getElementById('filePicker')
    input.onchange = () => {
      const files = Array.from(input.files)
      input.value = ''
      resolve(files)
    }
    input.click()
  })
}

function chooseFolderWeb() {
  return new Promise(resolve => {
    const input = document.getElementById('folderPicker')
    input.onchange = () => {
      const files = Array.from(input.files).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f.name))
      input.value = ''
      resolve(files)
    }
    input.click()
  })
}

async function refresh() {
  const outputs = await enumerateOutputs()
  devicesContainer.innerHTML = ''
  devicePlayers = {}
  // Show hint to enable devices if labels are empty or no outputs
  const noLabels = outputs.length === 0 || outputs.every(o => !o.label)
  if (enableBtn) enableBtn.style.display = noLabels ? 'inline-block' : 'none'
  if (noLabels && outputs.length === 0) {
    const fake = { deviceId: 'default', label: 'Default output' }
    const card = createDeviceCard(fake)
    devicesContainer.appendChild(card)
    return
  }
  outputs.forEach(d => {
    const card = createDeviceCard(d)
    devicesContainer.appendChild(card)
  })
}

refreshBtn.addEventListener('click', refresh)

// initial
const splash = document.getElementById('splash')
const enableOnly = document.getElementById('enableOnly')

if (enableOnly) {
  enableOnly.addEventListener('click', async () => {
    const ok = await requestDevicePermissions()
    if (ok) {
      // hide splash and show main UI
      try { splash.style.display = 'none' } catch(e){}
      await refresh()
    } else {
      alert('Permesso indispensabile per visualizzare i dispositivi audio. Consenti accesso al microfono e riprova.')
    }
  })
}

if (enableBtn) {
  enableBtn.addEventListener('click', async () => {
    const ok = await requestDevicePermissions()
    if (ok) await refresh()
    else alert('Permesso indispensabile per visualizzare i dispositivi audio. Consenti accesso al microfono e riprova.')
  })
}

// If page is loaded and permissions already granted, hide splash automatically
navigator.permissions && navigator.permissions.query && navigator.permissions.query({ name: 'microphone' }).then(p => {
  if (p.state === 'granted') { try { splash.style.display = 'none' } catch(e){}; refresh() }
}).catch(()=>{})

refresh()


