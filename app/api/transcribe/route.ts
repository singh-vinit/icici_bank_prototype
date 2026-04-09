import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File

    if (!audio) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    // Guard: reject files that are too small to be real speech
    // Whisper needs at least ~0.1s — 1000 bytes is a safe minimum threshold
    if (audio.size < 1000) {
      return NextResponse.json(
        { error: 'Recording too short. Please hold the button and speak.' },
        { status: 400 }
      )
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: 'whisper-1',
      language: 'en',
      prompt: 'ICICI Bank, FD, fixed deposit, balance, transfer, savings, NEFT, account, rupees',
    })

    return NextResponse.json({ text: transcription.text })
  } catch (err) {
    console.error('Transcribe error:', err)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}