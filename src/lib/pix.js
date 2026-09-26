const crc16 = (str) => {
  let crc = 0xFFFF
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}
const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`
const strip = (v='') => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 .@+\-]/g,'').toUpperCase()

export function buildPixPayload({ key, name, city, amount, txid = '***' }) {
  const merchant = field('00', 'BR.GOV.BCB.PIX') + field('01', String(key || ''))
  let payload = field('00', '01') + field('26', merchant) + field('52', '0000') + field('53', '986')
  if (Number(amount) > 0) payload += field('54', Number(amount).toFixed(2))
  payload += field('58', 'BR') + field('59', strip(name).slice(0, 25) || 'TEAM PENNING') + field('60', strip(city).slice(0, 15) || 'BRASIL')
  payload += field('62', field('05', strip(txid).slice(0, 25) || '***'))
  payload += '6304'
  return payload + crc16(payload)
}
