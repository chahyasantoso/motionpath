import { Route, Routes } from 'react-router-dom';
import './App.css';
import HubPage from './components/Hub/HubPage';
import DemoPage from './components/Demo/DemoPage';
import BurstPage from './components/Burst/BurstPage';
import MotorcyclePage from './components/Motorcycle/MotorcyclePage';
import PasarMalamPage from './components/PasarMalam/PasarMalamPage';
import PasarMalamObserverPage from './components/PasarMalam/PasarMalamObserverPage';
import RefreshSpikePage from './components/Spikes/RefreshSpikePage';
import StaggerSpikePage from './components/Spikes/StaggerSpikePage';
import TowerDefensePage from './components/TowerDefense/TowerDefensePage';
import GlobalNav from './components/Navigation/GlobalNav';
import SpiralPage from './components/Spiral/SpiralPage';

export default function App() {
  return (
    <>
      <GlobalNav />
      <Routes>
        <Route path="/" element={<HubPage />} />
        <Route path="/hooks-demo" element={<DemoPage />} />
        <Route path="/burst" element={<BurstPage />} />
        <Route path="/moto" element={<MotorcyclePage />} />
        <Route path="/pasarmalam" element={<PasarMalamPage />} />
        <Route path="/pasarmalam-observer" element={<PasarMalamObserverPage />} />
        <Route path="/spike-refresh" element={<RefreshSpikePage />} />
        <Route path="/spike-stagger" element={<StaggerSpikePage />} />
        <Route path="/tower-defense" element={<TowerDefensePage />} />
        <Route path="/spiral" element={<SpiralPage />} />
      </Routes>
    </>
  );
}
