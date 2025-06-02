'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, API_BASE } from '@/lib/api';
import { toast } from 'react-toastify';

const fetcherWithToken = (url: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  }).then(res => {
    if (!res.ok) throw new Error('Erreur API');
    return res.json();
  });
};

export default function MenusListPage() {
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get('restaurantId');
  const { data: menus, error, mutate } = useSWR(
    restaurantId ? `${api.menu}?restaurant_id=${restaurantId}` : null,
    fetcherWithToken
  );

  const [menuName, setMenuName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const createMenu = async () => {
    if (!restaurantId || !menuName || !token) return;
    const res = await fetch(api.menu, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: menuName, restaurant: restaurantId })
    });
    if (res.ok) {
      setMenuName('');
      mutate();
      toast.success('Menu créé');
    } else {
      toast.error("Erreur lors de la création");
    }
  };

  const deleteMenu = async (id: string) => {
    if (!token || !confirm('Supprimer ce menu ?')) return;
    const res = await fetch(`${api.menu}${id}/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) toast.success('Menu supprimé');
    else toast.error('Erreur lors de la suppression');
    mutate();
  };

  const updateMenu = async (id: string) => {
    if (!token || !editValue) return;
    const res = await fetch(`${api.menu}${id}/`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: editValue })
    });
    if (res.ok) toast.success('Menu mis à jour');
    else toast.error('Erreur lors de la mise à jour');
    setEditing(null);
    setEditValue('');
    mutate();
  };

  if (!restaurantId) {
    return <p className="text-red-600 text-center mt-10">Aucun restaurant sélectionné.</p>;
  }

  if (error) {
    return <p className="text-red-600 text-center mt-10">Erreur de chargement des menus.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Vos menus</h1>

      <div className="mb-8">
        <input
          value={menuName}
          onChange={e => setMenuName(e.target.value)}
          placeholder="Nom du menu"
          className="border px-3 py-2 rounded mr-2"
        />
        <button
          onClick={createMenu}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Créer un menu
        </button>
      </div>

      <div className="space-y-4">
        {menus?.map((menu: any) => (
          <div key={menu.id} className="p-4 border rounded bg-white">
            {editing === menu.id ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="border px-2 py-1 rounded"
                />
                <button
                  onClick={() => updateMenu(menu.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="text-gray-600 px-2"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <Link href={`/restaurants/menus/${menu.id}`} className="text-xl font-semibold hover:underline">
                  {menu.name}
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(menu.id);
                      setEditValue(menu.name);
                    }}
                    className="text-sm text-yellow-600 hover:underline"
                  >
                    Renommer
                  </button>
                  <button
                    onClick={() => deleteMenu(menu.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {menus?.length === 0 && <p className="text-gray-500">Aucun menu trouvé.</p>}
      </div>
    </div>
  );
}
