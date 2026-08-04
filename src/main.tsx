import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'
import './styles.css'
import App from './App'

// 028: a crash anywhere below here used to blank the whole app to a bare
// root — this stops it at "the app broke" instead of a white screen.
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  render() {
    if (this.state.crashed) return <div className="center bad">Something broke — reload to retry.</div>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
