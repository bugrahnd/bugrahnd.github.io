// First: declares the cascade-layer order and loads the Astryx base styles.
import './globals.css';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
