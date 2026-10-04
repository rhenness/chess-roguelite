import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadBundledLevels } from './game/levels';
import './styles.css';

const catalog = loadBundledLevels();
createRoot(document.getElementById('root')!).render(
    <StrictMode><App levels={catalog.levels} levelWarnings={catalog.warnings} /></StrictMode>,
);
