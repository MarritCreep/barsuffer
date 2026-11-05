import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты лежат в сборке сайта — никаких запросов к сторонним серверам.
import '@fontsource-variable/rubik';
import '@fontsource-variable/caveat';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
