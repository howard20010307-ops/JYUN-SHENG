import { useId, useState, type FormEvent } from 'react'

type Props = {
  tryLogin: (user: string, password: string) => boolean
}

export function AppLoginGate({ tryLogin }: Props) {
  const formId = useId()
  const userId = `${formId}-user`
  const passId = `${formId}-pass`

  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const ok = tryLogin(user, password)
    if (!ok) {
      setPassword('')
      setError('帳號或密碼不正確。')
    }
  }

  return (
    <div className="app">
      <div className="appLoginGate" role="dialog" aria-modal="true" aria-labelledby="appLoginGateTitle">
        <div className="appLoginGate__panel">
          <h1 id="appLoginGateTitle" className="appLoginGate__title">
            鈞泩放樣 · 營運試算
          </h1>
          <p className="appLoginGate__desc">
            請輸入帳號與密碼。管理者（howard07）可編輯；訪客帳號僅能瀏覽（唯讀），帳密請見程式設定檔。
          </p>
          <form className="appLoginGate__form" autoComplete="off" onSubmit={submit}>
            <label className="appLoginGate__label" htmlFor={userId}>
              帳號
            </label>
            <input
              id={userId}
              className="appLoginGate__input"
              name="username"
              autoComplete="off"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
            <label className="appLoginGate__label" htmlFor={passId}>
              密碼
            </label>
            <input
              id={passId}
              className="appLoginGate__input"
              name="password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? (
              <p className="appLoginGate__err" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn appLoginGate__submit">
              登入
            </button>
          </form>
          <p className="appLoginGate__hint">
            登入狀態僅保留在目前分頁；關閉分頁或重新開啟網址後須再次手動登入。按「登出」可立即結束本次連線。
          </p>
        </div>
      </div>
    </div>
  )
}
