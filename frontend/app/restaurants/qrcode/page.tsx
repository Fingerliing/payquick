'use client'

import { useState } from 'react'
import { useSearchParams } from "next/navigation"
import { QRCode } from '@/types/qrcode';
import { api } from '@/lib/api';

export default function QRCodePage() {
  const [tableCount, setTableCount] = useState(1)
  const [qrCodes, setQrCodes] = useState<QRCode[]>([])
  const searchParams = useSearchParams()
  const restaurantId = searchParams.get("restaurantId")
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium')
  const token = localStorage.getItem("token")
  if (!token) {
    alert("Utilisateur non authentifié")
    return
  }

  const generate = async () => {
    if (!restaurantId) {
      alert("restaurantId manquant")
      return
    }

  const qrData = Array.from({ length: tableCount }).map((_, i) => {
    const tableId = `table-${i + 1}`
    const url = `${window.location.origin}/clients/order?restaurantId=${restaurantId}&tableId=${tableId}`
    return { tableId, url }
  })

  const res = await fetch(api.qrCodes, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ qrData }),
  })

  const data = await res.json()
    if (Array.isArray(data.qrCodes)) {
      setQrCodes(data.qrCodes);
    } else {
      console.error("QR codes manquants :", data);
      alert("Une erreur est survenue lors de la génération des QR codes.");
      setQrCodes([]);
    }    
  }

  const getQRSizeClass = () => {
    switch (size) {
      case 'small': return 'w-24'
      case 'medium': return 'w-40'
      case 'large': return 'w-60'
    }
  }
  
  return (
    <div className="max-w-6xl mx-auto py-10 px-4 print:bg-white print:p-0">
      <h1 className="text-3xl font-bold text-center mb-8 print:hidden">
        Générer les QR Codes des tables
      </h1>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8 justify-center print:hidden">
        <label className="font-medium text-lg">Nombre de tables :</label>
        <input
          type="number"
          min={1}
          value={tableCount}
          onChange={(e) => setTableCount(parseInt(e.target.value))}
          className="border px-4 py-2 rounded w-24 text-center"
        />

        <label className="font-medium text-lg">Taille :</label>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as 'small' | 'medium' | 'large')}
          className="border px-4 py-2 rounded"
        >
          <option value="small">Petite</option>
          <option value="medium">Moyenne</option>
          <option value="large">Grande</option>
        </select>

        <button
          onClick={generate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded transition"
        >
          Générer
        </button>
      </div>

      {qrCodes.length > 0 && (
        <>
          <button
            onClick={() => window.print()}
            className="mb-6 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded transition print:hidden"
          >
            Imprimer les QR Codes
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 print:grid-cols-3">
            {qrCodes.map((qr, index) => (
              <div
                key={index}
                className="border border-gray-300 rounded-lg p-4 bg-white flex flex-col items-center print:shadow-none print:border print:border-gray-400"
              >
                <p className="mb-2 font-semibold text-sm text-gray-700 print:text-black">
                  Table {qr.tableId?.match(/\d+/)?.[0] || '—'}
                </p>
                <img
                  src={qr.qrCodeUrl}
                  alt={`QR Table ${qr.tableId}`}
                  className={`${getQRSizeClass()} aspect-square object-contain`}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
