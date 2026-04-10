'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { supabase } from '@/lib/supabase'
import type { Phase, User, Transfer } from '@/types'
import SupportBot from '@/components/SupportBot'
import { Mic, Pause } from 'lucide-react'

const phaseConfig: Record<Phase, { label: string; variant: 'secondary' | 'destructive' | 'default' | 'outline' }> = {
  idle:      { label: 'Hold mic to speak', variant: 'secondary'   },
  listening: { label: 'Listening...',       variant: 'destructive' },
  thinking:  { label: 'Thinking...',        variant: 'default'     },
  speaking:  { label: 'Speaking...',        variant: 'outline'     },
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([])
  const [activeUser, setActiveUser] = useState<User | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [botReply, setBotReply] = useState('')
  const [pendingIntent, setPendingIntent] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const { startRecording, stopRecording, isRecording } = useVoiceRecorder()

  useEffect(() => {
    supabase
      .from('users')
      .select('*')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setUsers(data)
          setActiveUser(data[0])
        }
      })
  }, [])

  useEffect(() => {
    if (activeUser) fetchTransfers()
  }, [activeUser?.id])

  const fetchTransfers = async () => {
    if (!activeUser) return
    const { transfers } = await fetch(
      `/api/transfers?userId=${activeUser.id}`
    ).then((r) => r.json())
    setTransfers(transfers ?? [])
  }

  const refreshActiveUser = async () => {
    if (!activeUser) return
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', activeUser.id)
      .single()
    if (data) setActiveUser(data)
  }

  const handleMicDown = async () => {
    if (phase !== 'idle' || !activeUser) return
    setErrorMsg('')
    await startRecording()
    setPhase('listening')
  }

  const handleMicUp = async () => {
    if (!isRecording || !activeUser) return
    setPhase('thinking')

    const blob = await stopRecording()

    // Blob is null when recording was too short (under 500ms)
    if (!blob) {
      setErrorMsg('Hold the button while speaking.')
      setPhase('idle')
      return
    }

    // Step 1 — Whisper STT
    const ext = blob.type.includes('mp4') ? 'mp4'
              : blob.type.includes('ogg') ? 'ogg'
              : 'webm'
    const form = new FormData()
    form.append('audio', new File([blob], `voice.${ext}`, { type: blob.type }))

    const transcribeRes = await fetch('/api/transcribe', {
      method: 'POST',
      body: form,
    }).then((r) => r.json())

    // Guard: transcribe failed or returned empty
    if (transcribeRes.error || !transcribeRes.text?.trim()) {
      setErrorMsg(transcribeRes.error ?? 'Could not hear you. Please try again.')
      setPhase('idle')
      return
    }

    const text = transcribeRes.text
    setTranscript(text)

    // Step 2 — GPT-4o intent + banking logic
    const { reply, nextPendingIntent } = await fetch('/api/banking-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text, user: activeUser, pendingIntent }),
    }).then((r) => r.json())

    setBotReply(reply)
    setPendingIntent(nextPendingIntent)

    // Guard: don't call TTS if reply is empty
    if (!reply || reply.trim().length === 0) {
      setPhase('idle')
      return
    }

    // Step 3 — OpenAI TTS
    setPhase('speaking')
    const audioRes = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: reply }),
    })
    const url = URL.createObjectURL(await audioRes.blob())
    const audio = new Audio(url)
    audio.onended = async () => {
      setPhase('idle')
      await refreshActiveUser()
      await fetchTransfers()
    }
    audio.play()
  }

  if (!activeUser) {
    return (
      <main className="min-h-screen bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-muted dark:from-background dark:to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 pt-0">
        <CardHeader className="flex flex-row items-center gap-3 py-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-t-lg">
          <div className="w-10 h-10 bg-primary-foreground bg-opacity-20 rounded-lg flex items-center justify-center backdrop-blur">
            <span className="text-primary text-sm font-bold">IC</span>
          </div>
          <div>
            <p className="font-bold text-sm">ICICI Bank</p>
            <p className="text-xs text-primary-foreground/80">AI Voice Assistant</p>
          </div>
          <div className="ml-auto">
            <Select
              value={activeUser.id}
              onValueChange={(id) => {
                const u = users.find((u) => u.id === id)
                if (u) {
                  setActiveUser(u)
                  setPendingIntent(null)
                  setTranscript('')
                  setBotReply('')
                  setErrorMsg('')
                }
              }}
            >
              <SelectTrigger className="w-32 h-8 text-xs bg-primary-foreground bg-opacity-20 text-primary-foreground border-primary-foreground border-opacity-30 hover:bg-opacity-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {/* User balance card */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-secondary/10 to-secondary/5 dark:from-secondary/20 dark:to-secondary/10 border border-secondary/30 dark:border-secondary/50 shadow-sm">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">{activeUser.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{activeUser.name}</p>
              <p className="text-xs text-muted-foreground">{activeUser.account_no}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground font-medium">Balance</p>
              <p className="font-bold text-lg text-primary">
                ₹{activeUser.balance.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Phase indicator */}
          <div className="flex justify-center pt-2">
            <Badge variant={phaseConfig[phase].variant} className="px-4 py-2 text-xs font-semibold">
              {phaseConfig[phase].label}
            </Badge>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 dark:bg-destructive/20 border border-destructive/30 dark:border-destructive/50">
              <p className="text-xs text-destructive font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Mic button — onPointerDown/Up works on both mobile and desktop */}
          <div className="flex flex-col items-center gap-3 pb-4 pt-2">
            <Button
              variant={phase === 'listening' ? 'destructive' : 'default'}
              className={`w-24 h-24 rounded-full select-none shadow-lg font-bold text-base transition-all duration-200 ${
                phase === 'listening' ? 'ring-4 ring-destructive/50 animate-pulse' : 'hover:shadow-xl'
              } ${phase === 'thinking' || phase === 'speaking' ? 'opacity-60' : ''}`}
              onPointerDown={handleMicDown}
              onPointerUp={handleMicUp}
              onPointerLeave={handleMicUp}
              disabled={phase === 'thinking' || phase === 'speaking'}
            >
              {phase === 'listening' ? <Pause className='size-10' /> : <Mic className='size-10' />}
            </Button>
            <p className="text-xs text-muted-foreground font-medium h-4">
              {phase === 'idle' ? 'Hold while speaking' : ''}
            </p>
          </div>

          {/* Transcript bubble */}
          {transcript && (
            <div className="p-4 rounded-xl bg-secondary/10 dark:bg-secondary/20 border border-secondary/30 dark:border-secondary/50 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <p className="text-xs text-secondary font-semibold mb-2">You said</p>
              <p className="text-sm text-foreground leading-relaxed">{transcript}</p>
            </div>
          )}

          {/* Bot reply bubble */}
          {botReply && (
            <div className="p-4 rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/50 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <p className="text-xs text-primary font-semibold mb-2">🤖 ICICI Assistant</p>
              <p className="text-sm text-foreground leading-relaxed">{botReply}</p>
            </div>
          )}

          {/* Transfer history */}
          {transfers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">
                Recent transfers
              </p>
              {transfers.map((t) => {
                const isSender = t.from_user_id === activeUser.id
                const other = isSender ? t.receiver : t.sender
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between p-3 rounded-xl text-sm border transition-all duration-200 ${
                      isSender
                        ? 'bg-destructive/10 dark:bg-destructive/20 border-destructive/30 dark:border-destructive/50'
                        : 'bg-chart-4/10 dark:bg-chart-4/20 border-chart-4/30 dark:border-chart-4/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground ${
                          isSender ? 'bg-destructive' : 'bg-chart-4'
                        }`}
                      >
                        {other?.initials ?? '??'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {isSender
                            ? `To ${other?.name ?? 'Unknown'}`
                            : `From ${other?.name ?? 'Unknown'}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-bold text-sm ${
                        isSender ? 'text-destructive' : 'text-chart-4'
                      }`}
                    >
                      {isSender ? '−' : '+'}₹
                      {t.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SupportBot />
    </main>
  )
}