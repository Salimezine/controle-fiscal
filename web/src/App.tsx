import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DMIPage from './pages/DMIPage';
import APPage from './pages/APPage';
import CNSSPage from './pages/CNSSPage';
import ISPage from './pages/ISPage';
import SocietesPage from './pages/SocietesPage';
import ComptesPage from './pages/ComptesPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex gap-4">
            <a href="/societes" className="px-3 py-2 rounded-lg hover:bg-gray-100">Sociétés</a>
            <a href="/comptes" className="px-3 py-2 rounded-lg hover:bg-gray-100">Comptes</a>
            <a href="/dmi" className="px-3 py-2 rounded-lg hover:bg-gray-100">DMI</a>
            <a href="/ap" className="px-3 py-2 rounded-lg hover:bg-gray-100">AP</a>
            <a href="/cnss" className="px-3 py-2 rounded-lg hover:bg-gray-100">CNSS</a>
            <a href="/is" className="px-3 py-2 rounded-lg hover:bg-gray-100">IS</a>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Navigate to="/societes" />} />
            <Route path="/societes" element={<SocietesPage />} />
            <Route path="/comptes" element={<ComptesPage />} />
            <Route path="/dmi" element={<DMIPage />} />
            <Route path="/ap" element={<APPage />} />
            <Route path="/cnss" element={<CNSSPage />} />
            <Route path="/is" element={<ISPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}