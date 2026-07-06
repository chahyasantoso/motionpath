import { Route, Routes } from 'react-router-dom';
import './App.css';
import BurstPage from './components/Burst/BurstPage';
import DemoPage from './components/Demo/DemoPage';
import MotorcyclePage from './components/Motorcycle/MotorcyclePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoPage />} />
      <Route path="/burst" element={<BurstPage />} />
      <Route path="/moto" element={<MotorcyclePage />} />
    </Routes>
  );
}
