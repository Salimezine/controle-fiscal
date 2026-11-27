import { useEffect, useState } from 'react';
import { API_URL } from '../lib/api';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  societe_id: string | null;
  is_active: number;
}

export default function ComptesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/users`)
      .then(r => r.json())
      .then(setUsers)
      .catch(console.error);
  }, []);

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">👥 Comptes</h1>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Comptes EUREX ({users.length})</h2>
        </div>
        <input
          type="search"
          placeholder="🔍 Rechercher un compte..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full p-2 border rounded mb-3"
        />
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="text-left p-2">Nom</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Rôle</th>
                <th className="text-left p-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-medium">{u.full_name}</td>
                  <td className="p-2 text-gray-600">{u.email}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role === 'admin' ? 'Expert / Admin' : 'Comptable'}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-sm text-gray-500 p-3">Aucun compte trouvé.</div>}
        </div>
      </div>
    </div>
  );
}
