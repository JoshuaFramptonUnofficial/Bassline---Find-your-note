import './styles.css';
import { createApp } from './app';

const dispose = createApp(document.querySelector<HTMLElement>('#app')!);
if (import.meta.hot) import.meta.hot.dispose(dispose);
