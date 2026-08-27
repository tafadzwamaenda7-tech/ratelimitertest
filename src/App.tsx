import { useState } from 'react'
import { Demo } from './demo/components/Demo.tsx'
import { Notes } from './demo/components/Notes.tsx'

type Tab = 'lab' | 'notes'

function App() {
  const [tab, setTab] = useState<Tab>('lab')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <h1>rate-limiter</h1>
            <p>Exact sliding window throttling, in-memory, in the browser</p>
          </div>
        </div>

        <nav className="tabs" aria-label="Sections">
          <button
            type="button"
            className={tab === 'lab' ? 'active' : ''}
            onClick={() => setTab('lab')}
          >
            Lab
          </button>
          <button
            type="button"
            className={tab === 'notes' ? 'active' : ''}
            onClick={() => setTab('notes')}
          >
            How it works
          </button>
        </nav>
      </header>

      {tab === 'lab' ? <Demo /> : <Notes />}
    </div>
  )
}

export default App