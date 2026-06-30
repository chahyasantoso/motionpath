import { Route, Routes } from 'react-router-dom';
import './App.css';
import BurstPage from './BurstPage';
import DemoPage from './components/Demo/DemoPage';
import PathEditor from './components/Editor/PathEditor';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoPage />} />
      <Route path="/burst" element={<BurstPage />} />
      <Route path="/editor" element={<PathEditor />} />
    </Routes>
  );
}
