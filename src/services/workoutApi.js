export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby2bKuo9EwA3OqNNtkineWsJPg3OChzlVefnFaUt2vgEotd9GNpeKRxMhgFRNAnl6oy/exec'

async function request(action, token, payload = {}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload })
  })
  if (!response.ok) throw new Error(`同步服務回應 ${response.status}`)
  const result = await response.json()
  if (!result.ok) throw new Error(result.error || '同步失敗')
  return result
}
export const getBootstrap = token => request('getBootstrap', token)
export const appendWorkoutLog = (token, log) => request('appendWorkoutLog', token, { log })
