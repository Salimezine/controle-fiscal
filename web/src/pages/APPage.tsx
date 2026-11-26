import { useState, useEffect } from 'react';

const API_URL = 'http://127.0.0.1:8787';

interface Travail {
  id: string;
  societe_id: string;
  type_travail: string;
  reference: string;
  titre: string;
  statut: string;
  created_at: string;
}

interface Piece {
  id: string;
  label: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

export default function APPage() {
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [selectedTravail, setSelectedTravail] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/travaux?type=AP`)
      .then(r => r.json())
      .then(setTravaux)
      .catch(console.error);
  }, []);

  const loadPieces = async (travailId: string) => {
    const res = await fetch(`${API_URL}/api/travaux/${travailId}/pieces`);
    const data = await res.json();
    setPieces(data);
    setSelectedTravail(travailId);
  };

  const uploadPdf = async (travailId: string, file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('label', file.name);
    
    try {
      const res = await fetch(`${API_URL}/api/travaux/${travailId}/pieces`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        loadPieces(travailId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const downloadPdf = async (pieceId: string, fileName: string) => {
    const res = await fetch(`${API_URL}/api/pieces/${pieceId}/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">🛒 AP - Achats</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Travaux AP</h2>
          {travaux.map(t => (
            <div
              key={t.id}
              className={`p-3 border rounded-lg mb-2 cursor-pointer hover:bg-gray-50 ${selectedTravail === t.id ? 'border-blue-500' : ''}`}
              onClick={() => loadPieces(t.id)}
            >
              <div className="font-medium">{t.titre}</div>
              <div className="text-sm text-gray-500">{t.reference} - {t.statut}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Pièces Justificatives PDF</h2>
          
          {selectedTravail && (
            <>
              <div className="mb-4">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 700 * 1024) {
                        alert('Fichier trop volumineux (max 700KB). Veuillez compresser le PDF.');
                        e.target.value = '';
                        return;
                      }
                      uploadPdf(selectedTravail, file);
                    }
                  }}
                  disabled={uploading}
                  className="block w-full text-sm"
                />
                {uploading && <p className="text-sm text-blue-600 mt-2">Upload en cours...</p>}
              </div>

              <div className="space-y-2">
                {pieces.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-gray-500">{p.file_name} ({Math.round(p.file_size / 1024)} KB)</div>
                    </div>
                    <button
                      onClick={() => downloadPdf(p.id, p.file_name)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Télécharger
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          
          {!selectedTravail && (
            <p className="text-gray-500 text-sm">Sélectionnez un travail pour voir les pièces</p>
          )}
        </div>
      </div>
    </div>
  );
}