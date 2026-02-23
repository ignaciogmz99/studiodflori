import './MainContent.css'
import TopMenu from './Top_menu.jsx'
import FloresMenu from './Flores_menu.jsx'

function MainContent() {
  return (
    <main className="main-content" aria-label="Contenido principal">
      <TopMenu />
      <FloresMenu />
    </main>
  )
}

export default MainContent
