import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты лежат в сборке сайта — никаких запросов к сторонним серверам.
import '@fontsource-variable/rubik';
import '@fontsource-variable/caveat';
import { I18nProvider } from './i18n/I18n';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/features.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
