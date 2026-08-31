import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
/* Layered builds put every Mantine rule in `@layer mantine`, so this app's own
   stylesheets win by default. The unlayered builds tie on specificity with Mantine's
   single-class selectors and are then decided by bundle order, which silently dropped
   app rules such as the metrics library's `display: flex`. */
import '@mantine/core/styles.layer.css'
import '@mantine/charts/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
)
