import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { db } from './services/db';
import './index.css';

async function bootstrap() {
  try {
    await db.initializePersistence();
  } catch (error) {
    // Storage initialization must never make the application unusable.
    console.error('Database initialization failed; continuing with recovery storage.', error);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
