'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { MenuItem } from '@/types/menu';
import { toast } from 'react-toastify';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const CATEGORIES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Menu'];

export default function RestaurantMenuManager() {
  const params = useParams();
  const menuId = params?.menuId as string;
  const { data: menuItems, mutate } = useSWR<MenuItem[]>(
    menuId ? `/api/menu-items/?menu_id=${menuId}` : null,
    fetcher
  );

  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Plat', description: '' });
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  const addMenuItem = async () => {
    if (!newItem.name || !newItem.price || !menuId) return;
    await fetch(`/api/menu-items/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, price: parseFloat(newItem.price), menu_id: menuId })
    });
    setNewItem({ name: '', price: '', category: 'Plat', description: '' });
    mutate();
    toast.success('Élément ajouté');
  };

  const updateMenuItem = async () => {
    if (!editItem) return;
    await fetch(`/api/menu-items/${editItem.id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editItem)
    });
    setEditItem(null);
    mutate();
    toast.success('Élément modifié');
  };

  const toggleAvailability = async (itemId: number) => {
    await fetch(`/api/menu-items/${itemId}/toggle/`, { method: 'POST' });
    mutate();
  };

  const deleteItem = async (itemId: number) => {
    const res = await fetch(`/api/menu-items/${itemId}/`, { method: 'DELETE' });
    if (res.ok) toast.success('Item supprimé avec succès.');
    else toast.error("Échec de la suppression.");
    mutate();
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
            {groupedItems[category].map(item => (
              <li key={item.id} className="flex justify-between items-center p-3 border rounded bg-white">
                <div>
                  <p className="font-medium">{item.name} - {item.price.toFixed(2)}€</p>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
                <button
                  onClick={() => toggleAvailability(item.id)}
                  className={`text-sm px-3 py-1 rounded ${item.is_available ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                >
                  {item.is_available ? 'Disponible' : 'Indisponible'}
                </button>
              </li>
            ))}
            {groupedItems[category].length === 0 && <p className="text-gray-500">Aucun item.</p>}
          </ul>
        </div>
      ))}
    </div>
  );
}
