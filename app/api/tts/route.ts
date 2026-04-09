import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const text: string = body?.text

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'text field is required and cannot be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const audio = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text.trim(),
      speed: 0.95,
    })

    const buffer = Buffer.from(await audio.arrayBuffer())

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (err) {
    console.error('TTS error:', err)
    return new Response(JSON.stringify({ error: 'TTS failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}