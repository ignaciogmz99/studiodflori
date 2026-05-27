import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { initializeGoogleTag, isGoogleTagEnabled, trackPageView } from './lib/analytics'

function GoogleTagBridge() {
  const location = useLocation()

  useEffect(() => {
    if (!isGoogleTagEnabled()) {
      return
    }

    initializeGoogleTag()
  }, [])

  useEffect(() => {
    if (!isGoogleTagEnabled()) {
      return
    }

    trackPageView({
      pagePath: `${location.pathname}${location.search || ''}`,
      pageTitle: document.title
    })
  }, [location.pathname, location.search])

  return null
}

export default GoogleTagBridge
