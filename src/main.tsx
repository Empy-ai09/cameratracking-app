import React from 'react';
import ReactDOM from 'react-dom/client';
import { IonApp, IonContent } from '@ionic/react';
import './styles.css';
import { CameraPage } from './pages/CameraPage';
import './ionic-init';

const App: React.FC = () => (
  <IonApp>
    <IonContent fullscreen>
      <CameraPage />
    </IonContent>
  </IonApp>
);

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('window error', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('unhandledrejection', event.reason);
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
