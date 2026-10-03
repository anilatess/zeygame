import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Uygulama kökü bulunamadı.');

createRoot(root).render(<App />);
