import { Route, Routes } from 'react-router-dom';
import './App.css';
import BurstPage from './components/Burst/BurstPage';
import DemoPage from './components/Demo/DemoPage';
import MotorcyclePage from './components/Motorcycle/MotorcyclePage';
import PasarMalamPage from './components/PasarMalam/PasarMalamPage';
import PasarMalamObserverPage from './components/PasarMalam/PasarMalamObserverPage';
import RefreshSpikePage from './components/Spikes/RefreshSpikePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoPage />} />
      <Route path="/burst" element={<BurstPage />} />
      <Route path="/moto" element={<MotorcyclePage />} />
      <Route path="/pasarmalam" element={<PasarMalamPage />} />
      <Route path="/pasarmalam-observer" element={<PasarMalamObserverPage />} />
      <Route path="/spike-refresh" element={<RefreshSpikePage />} />
    </Routes>
  );
}
