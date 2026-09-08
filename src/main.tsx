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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
