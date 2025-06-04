'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { MenuItem } from '@/types/menu';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { normalizeMenuItem } from '@/lib/utils';
import { fetchWithToken } from '@/lib/fetchs';

const fetcherWithToken = (url: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  }).then(async res => {
    if (!res.ok) throw new Error('Erreur API');
    const data = await res.json();
    return data.map(normalizeMenuItem);
  });
};

const CATEGORIES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Menu'];

export default function RestaurantMenuManager() {
  const params = useParams();
  const menuId = params?.menuId as string;
  const { data: menuItems, mutate } = useSWR<MenuItem[]>(
    menuId ? `${api.menuItems}?menu_id=${menuId}` : null,
    fetcherWithToken
  );

  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Plat', description: '' });
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  const addMenuItem = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
    if (!newItem.name || !newItem.price || !menuId || !token) {
      toast.error('Champs manquants ou utilisateur non authentifié');
      return;
    }
  
    const res = await fetch(api.menuItems, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newItem.name,
        price: parseFloat(newItem.price),
        category: newItem.category,
        description: newItem.description,
        menu: parseInt(menuId)
      })
    });
  
    if (!res.ok) {
      const error = await res.json();
      console.error('[Erreur ajout item]', error);
      toast.error('Erreur lors de l’ajout');
      return;
    }
  
    setNewItem({ name: '', price: '', category: 'Plat', description: '' });
    mutate();
    toast.success('Élément ajouté');
  };

  const updateMenuItem = async () => {
    if (!editItem) return;
  
    try {
      await fetchWithToken(api.menuItemsDetails(editItem.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });
      toast.success('Élément modifié');
      setEditItem(null);
      mutate();
    } catch (err) {
      toast.error(`Erreur : ${(err as Error).message}`);
    }
  };

  const toggleAvailability = async (itemId: number) => {
    try {
      await fetchWithToken(`${api.menuItemsDetails(itemId)}toggle/`, {
        method: 'POST',
      });
      mutate();
    } catch (err) {
      toast.error('Erreur de mise à jour');
    }
  };

  const deleteItem = async (itemId: number) => {
    try {
      await fetchWithToken(api.menuItemsDetails(itemId), { method: 'DELETE' });
      toast.success('Item supprimé avec succès');
      mutate();
    } catch (err) {
      toast.error('Échec de la suppression');
    }
  };

  const groupedItems = CATEGORIES.reduce((acc, category) => {
    acc[category] = menuItems?.filter((item: MenuItem) => item.category === category) || [];
    return acc;
  }, {} as Record<string, MenuItem[]>);

  if (!menuId) {
    return <p className="text-red-600 text-center mt-10">Aucun menu sélectionné.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Gérer le menu</h1>
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Ajouter un élément</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Nom"
            value={newItem.name}
            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <input
            type="text"
            placeholder="Prix (€)"
            value={newItem.price}
            onChange={e => setNewItem({ ...newItem, price: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <select
            value={newItem.category}
            onChange={e => setNewItem({ ...newItem, category: e.target.value })}
            className="border px-3 py-2 rounded"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            value={newItem.description}
            onChange={e => setNewItem({ ...newItem, description: e.target.value })}
            className="border px-3 py-2 rounded"
          />
        </div>
        <button
          onClick={addMenuItem}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Ajouter
        </button>
      </div>

      {CATEGORIES.map(category => (
        <div key={category} className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">{category}s</h2>
          <ul className="space-y-2">
            {groupedItems[category].map(item => {
              return (
                <li key={item.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-3 border rounded bg-white">
                  {editItem?.id === item.id ? (
                    <div className="flex flex-col gap-2 w-full">
                      <input
                        value={editItem.name}
                        onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                        className="border px-2 py-1 rounded"
                      />
                      <input
                        value={editItem.price}
                        type="number"
                        onChange={e => setEditItem({ ...editItem, price: parseFloat(e.target.value) })}
                        className="border px-2 py-1 rounded"
                      />
                      <input
                        value={editItem.description}
                        onChange={e => setEditItem({ ...editItem, description: e.target.value })}
                        className="border px-2 py-1 rounded"
                      />
                      <select
                        value={editItem.category}
                        onChange={e => setEditItem({ ...editItem, category: e.target.value })}
                        className="border px-2 py-1 rounded"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={updateMenuItem} className="bg-blue-600 text-white px-3 py-1 rounded">Enregistrer</button>
                        <button onClick={() => setEditItem(null)} className="bg-gray-400 text-white px-3 py-1 rounded">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-medium">{item.name} - {item.price.toFixed(2)}€</p>
                        <p className="text-sm text-gray-600">{item.description}</p>
                      </div>
                      <div className="flex flex-col gap-1 md:flex-row md:gap-2 mt-2 md:mt-0">
                        <button
                          onClick={() => toggleAvailability(item.id)}
                          className={`text-sm px-3 py-1 rounded ${item.is_available ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                        >
                          {item.is_available ? 'Disponible' : 'Indisponible'}
                        </button>
                        <button
                          onClick={() => setEditItem(item)}
                          className="text-sm text-blue-600 underline"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-sm text-red-600 underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            {groupedItems[category].length === 0 && <p className="text-gray-500">Aucun item.</p>}
          </ul>
        </div>
      ))}
    </div>
  );
}
