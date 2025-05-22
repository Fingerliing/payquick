'use client'

import { useState } from 'react'
import { useSearchParams } from "next/navigation";

export default function QRCodePage() {
  const [tableCount, setTableCount] = useState(1)
  const [qrCodes, setQrCodes] = useState<string[]>([])
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");

  const generate = async () => {
    const res = await fetch('/api/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableCount, restaurantId }),
    })
    const data = await res.json()
    setQrCodes(data.qrCodes)
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold text-center mb-8">
        Générer les QR Codes des tables
      </h1>

      <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-8">
        <label htmlFor="tableCount" className="text-lg font-medium">
          Nombre de tables :
        </label>
        <input
          id="tableCount"
          type="number"
          min={1}
          value={tableCount}
          onChange={(e) => setTableCount(parseInt(e.target.value))}
          className="border border-gray-300 rounded px-4 py-2 w-32 text-center"
        />
        <button
          onClick={generate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded transition duration-200"
        >
          Générer
        </button>
      </div>

      {qrCodes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {qrCodes.map((qr, index) => (
            <div
              key={index}
              className="border rounded shadow-sm p-3 flex flex-col items-center bg-white"
            >
              <p className="mb-2 font-semibold text-sm text-gray-700">
                Table {index + 1}
              </p>
              <img
                src={qr}
                alt={`QR Table ${index + 1}`}
                className="w-full aspect-square object-contain"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
