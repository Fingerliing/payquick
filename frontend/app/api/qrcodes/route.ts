import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export async function POST(req: NextRequest) {
  const { tableCount, restaurantId } = await req.json()
  const qrCodes: string[] = []

  for (let i = 1; i <= tableCount; i++) {
    const url = `https://eatandgo.com/restaurant/${restaurantId}/table/${i}`
    const qr = await QRCode.toDataURL(url)
    qrCodes.push(qr)
  }

  return NextResponse.json({ qrCodes })
}
