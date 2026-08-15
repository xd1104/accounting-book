/**
 * Preset places to keep money, so setting one up is a tap rather than typing a
 * name and hunting for a colour. Codes are the Taiwanese three-digit bank codes.
 */
export interface BankPreset {
  name: string
  code?: string
  emoji: string
  color: string
  /** Extra search terms (English name, nickname) */
  alias?: string
}

export const BANKS: BankPreset[] = [
  { name: '中國信託', code: '822', emoji: '🏦', color: '#0b4ea2', alias: 'ctbc 中信' },
  { name: '國泰世華', code: '013', emoji: '🏦', color: '#00873c', alias: 'cathay 國泰' },
  { name: '玉山銀行', code: '808', emoji: '🏦', color: '#0f6b45', alias: 'esun' },
  { name: '台新銀行', code: '812', emoji: '🏦', color: '#0f9a9a', alias: 'taishin' },
  { name: '富邦銀行', code: '012', emoji: '🏦', color: '#0f9d58', alias: 'fubon 北富銀 台北富邦' },
  { name: '永豐銀行', code: '807', emoji: '🏦', color: '#e08700', alias: 'sinopac' },
  { name: '第一銀行', code: '007', emoji: '🏦', color: '#c8232c', alias: 'first 一銀' },
  { name: '華南銀行', code: '008', emoji: '🏦', color: '#1c7a3e', alias: 'hncb 華銀' },
  { name: '彰化銀行', code: '009', emoji: '🏦', color: '#0f5c9b', alias: 'chb 彰銀' },
  { name: '臺灣銀行', code: '004', emoji: '🏦', color: '#0b6b3a', alias: 'bot 台銀' },
  { name: '兆豐銀行', code: '017', emoji: '🏦', color: '#0f5ca8', alias: 'mega' },
  { name: '合作金庫', code: '006', emoji: '🏦', color: '#12793f', alias: 'tcb 合庫' },
  { name: '土地銀行', code: '005', emoji: '🏦', color: '#0f7a4a', alias: 'landbank 土銀' },
  { name: '上海商銀', code: '011', emoji: '🏦', color: '#24409a', alias: 'scsb' },
  { name: '聯邦銀行', code: '803', emoji: '🏦', color: '#c8172a', alias: 'ubot' },
  { name: '遠東商銀', code: '805', emoji: '🏦', color: '#0f8fd6', alias: 'feib 遠銀' },
  { name: '元大銀行', code: '806', emoji: '🏦', color: '#c8231e', alias: 'yuanta' },
  { name: '凱基銀行', code: '809', emoji: '🏦', color: '#124a86', alias: 'kgi' },
  { name: '新光銀行', code: '103', emoji: '🏦', color: '#c8102e', alias: 'skbank' },
  { name: '台灣企銀', code: '050', emoji: '🏦', color: '#c8231e', alias: 'tbb 企銀' },
  { name: '王道銀行', code: '048', emoji: '🏦', color: '#e0651f', alias: 'o-bank' },
  { name: '台中銀行', code: '053', emoji: '🏦', color: '#c8232a', alias: 'tcbbank' },
  { name: '渣打銀行', code: '052', emoji: '🏦', color: '#0f6fc8', alias: 'standard chartered' },
  { name: '匯豐銀行', code: '081', emoji: '🏦', color: '#c8102e', alias: 'hsbc' },
  { name: '花旗銀行', code: '021', emoji: '🏦', color: '#12539b', alias: 'citi' },
  { name: '郵局', code: '700', emoji: '🏤', color: '#0f8a4a', alias: '中華郵政 postal' },
  { name: 'LINE Bank', code: '824', emoji: '📱', color: '#06c755', alias: '連線商業銀行' },
  { name: '將來銀行', code: '823', emoji: '📱', color: '#5b53e0', alias: 'next bank' },
  { name: '樂天銀行', code: '826', emoji: '📱', color: '#bf0000', alias: 'rakuten' },
]

export const EWALLETS: BankPreset[] = [
  { name: 'LINE Pay', emoji: '📱', color: '#06c755', alias: 'linepay' },
  { name: '街口支付', emoji: '📱', color: '#e0522f', alias: 'jkopay' },
  { name: '悠遊卡', emoji: '💳', color: '#0f8fc8', alias: 'easycard' },
  { name: '一卡通', emoji: '💳', color: '#e08700', alias: 'ipass' },
  { name: '悠遊付', emoji: '📱', color: '#0f8fc8', alias: 'easywallet' },
  { name: '全支付', emoji: '📱', color: '#c8232a', alias: 'pxpay' },
  { name: '信用卡', emoji: '💳', color: '#5b53e0', alias: 'credit card' },
  { name: '證券戶', emoji: '📈', color: '#12539b', alias: 'broker 股票' },
]

export const CASH_PRESETS: BankPreset[] = [
  { name: '錢包', emoji: '💵', color: '#22a35c', alias: '現金' },
  { name: '零錢包', emoji: '🪙', color: '#d2a106', alias: '零錢' },
  { name: '家裡現金', emoji: '🏠', color: '#c07a1f', alias: '私房錢' },
  { name: '紅包袋', emoji: '🧧', color: '#c8232a', alias: '紅包' },
]

export function searchPresets(list: BankPreset[], query: string): BankPreset[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.code?.includes(q) ||
      b.alias?.toLowerCase().includes(q),
  )
}
