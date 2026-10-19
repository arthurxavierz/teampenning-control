// Cópia de segurança no computador da organização.
//
// No Chrome e no Edge dá para escolher uma pasta uma vez (ex.: Documentos >
// Cópias Team Penning) e cada cópia é gravada direto nela. Nos outros
// navegadores o arquivo vai para Downloads. A pasta escolhida fica guardada
// no próprio navegador (IndexedDB), nunca sai do computador.

export const BACKUP_EVERY_DAYS = 7
export const KEEPALIVE_LATE_DAYS = 3

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export const backupFileName = (date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `copia-team-penning-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`
}

export const daysSince = (iso, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : null)

export const backupOverdue = (settings) => {
  const days = daysSince(settings?.lastBackupAt)
  return days == null || days >= BACKUP_EVERY_DAYS
}

// IndexedDB mínimo para guardar o "endereço" da pasta escolhida.
const DB = 'tp-backup'
const STORE = 'handles'
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error)
    }
  })
}
const getFolder = () => idb('readonly', (s) => s.get('folder')).catch(() => null)
const setFolder = (handle) => idb('readwrite', (s) => s.put(handle, 'folder'))

export async function backupFolderName() {
  if (!canPickFolder()) return ''
  const handle = await getFolder()
  return handle?.name || ''
}

export async function chooseBackupFolder() {
  const handle = await window.showDirectoryPicker({ id: 'tp-backup', mode: 'readwrite', startIn: 'documents' })
  await setFolder(handle)
  return handle.name
}

function download(text, name) {
  const blob = new Blob([text], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Grava a cópia na pasta escolhida; sem pasta (ou sem permissão), baixa.
// Devolve onde o arquivo foi parar, para a tela explicar.
export async function saveBackupFile(text) {
  const name = backupFileName()
  const handle = canPickFolder() ? await getFolder() : null
  if (handle) {
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        const file = await handle.getFileHandle(name, { create: true })
        const writable = await file.createWritable()
        await writable.write(text)
        await writable.close()
        return { name, place: `pasta ${handle.name}` }
      }
    } catch (err) {
      console.warn('Não deu para gravar na pasta escolhida, baixando:', err)
    }
  }
  download(text, name)
  return { name, place: 'pasta Downloads' }
}
