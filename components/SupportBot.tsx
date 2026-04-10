'use client'

import { MicVocal, X, AlertCircle, MessageCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useState } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { Badge } from './ui/badge'

export type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Message {
  userQuery: string
  aiResponse: string
}

const SupportBot = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const { startRecording, stopRecording, isRecording } = useVoiceRecorder()

  const phaseConfig: Record<Phase, { label: string; color: string }> = {
    idle: { label: 'Hold mic to speak', color: 'bg-blue-500' },
    listening: { label: 'Listening...', color: 'bg-red-500' },
    thinking: { label: 'Thinking...', color: 'bg-yellow-500' },
    speaking: { label: 'Speaking...', color: 'bg-green-500' },
  }

  const handleMicPress = async () => {
    try {
      setErrorMsg('')
      setPhase('listening')
      await startRecording()
    } catch (err) {
      console.error('Error starting recording:', err)
      const errorText = err instanceof Error ? err.message : 'Failed to start recording'
      setErrorMsg(errorText)
      setPhase('idle')
    }
  }

  const handleMicRelease = async () => {
    try {
      const audioBlob = await stopRecording()
      if (!audioBlob) {
        setPhase('idle')
        return
      }

      // Send to transcribe
      setPhase('thinking')
      const formData = new FormData()
      // Pass filename as third parameter so OpenAI recognizes the format
      formData.append('audio', audioBlob, 'audio.webm')

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!transcribeRes.ok) {
        const errorData = await transcribeRes.json()
        console.error('Transcription failed:', errorData)
        setCurrentMessage({
          userQuery: 'Unable to transcribe audio',
          aiResponse: 'Sorry, I could not understand your audio. Please try again.',
        })
        setErrorMsg('Transcription failed. Please try again.')
        setPhase('idle')
        return
      }

      const { text: transcript } = await transcribeRes.json()

      if (!transcript || transcript.trim().length === 0) {
        setCurrentMessage({
          userQuery: 'No speech detected',
          aiResponse: 'I did not hear any speech. Please try again.',
        })
        setErrorMsg('No speech detected. Please speak clearly.')
        setPhase('idle')
        return
      }

      // Send to support-ai
      const supportRes = await fetch('/api/support-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })

      if (!supportRes.ok) {
        const errorData = await supportRes.json()
        console.error('Support AI failed:', errorData)
        setCurrentMessage({
          userQuery: transcript,
          aiResponse: 'Sorry, I encountered an error processing your question. Please try again.',
        })
        setErrorMsg('Failed to process your request.')
        setPhase('idle')
        return
      }

      const { reply } = await supportRes.json()

      setCurrentMessage({
        userQuery: transcript,
        aiResponse: reply,
      })
      setErrorMsg('')

      // Text-to-speech
      setPhase('speaking')
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply }),
      })

      if (!ttsRes.ok) {
        console.error('TTS failed')
        setPhase('idle')
        return
      }

      const audioData = await ttsRes.arrayBuffer()
      const audio = new Audio(URL.createObjectURL(new Blob([audioData], { type: 'audio/mpeg' })))
      audio.play()

      audio.onended = () => {
        setPhase('idle')
      }
    } catch (err) {
      console.error('Error processing voice:', err)
      setErrorMsg('An error occurred. Please try again.')
      setPhase('idle')
    }
  }

  return (
    <div className='fixed z-50 bottom-5 right-5'>
      {isOpen && (
        <div className='absolute bottom-24 right-0 w-96 bg-card dark:bg-card border border-border rounded-2xl shadow-2xl p-5 mb-3 animate-in slide-in-from-bottom-4 fade-in'>
          <div className='flex justify-between items-center mb-4 pb-4 border-b border-border'>
            <div className='flex items-center gap-2'>
              <div className='w-8 h-8 bg-gradient-to-br from-secondary to-secondary/80 rounded-lg flex items-center justify-center'>
                <MessageCircle size={18} className='text-secondary-foreground' />
              </div>
              <h3 className='font-bold text-foreground'>Banking Support</h3>
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                setErrorMsg('')
              }}
              className='text-muted-foreground hover:text-foreground transition-colors p-1'
            >
              <X size={20} />
            </button>
          </div>

          {errorMsg && (
            <div className='bg-destructive/10 dark:bg-destructive/20 border border-destructive/30 dark:border-destructive/50 p-3 rounded-lg mb-4 flex items-start gap-2'>
              <AlertCircle size={16} className='text-destructive mt-0.5 flex-shrink-0' />
              <p className='text-sm text-destructive'>{errorMsg}</p>
            </div>
          )}

          {currentMessage ? (
            <div className='space-y-3 max-h-96 overflow-y-auto'>
              <div className='bg-secondary/10 dark:bg-secondary/20 border border-secondary/30 dark:border-secondary/50 p-4 rounded-xl'>
                <p className='text-xs font-bold text-secondary mb-2 uppercase tracking-wide'>Your Question</p>
                <p className='text-sm text-foreground leading-relaxed'>{currentMessage.userQuery}</p>
              </div>

              <div className='bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border border-primary/30 dark:border-primary/50 p-4 rounded-xl'>
                <p className='text-xs font-bold text-primary mb-2 uppercase tracking-wide'>🤖 AI Response</p>
                <p className='text-sm text-foreground leading-relaxed'>{currentMessage.aiResponse}</p>
              </div>

              <button
                onClick={() => {
                  setCurrentMessage(null)
                  setErrorMsg('')
                }}
                className='w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold py-2 rounded-lg transition-colors text-sm mt-2'
              >
                Ask Another Question
              </button>
            </div>
          ) : (
            <div className='text-center py-6'>
              <div className='mb-4'>
                <Badge className={`${phaseConfig[phase].color} text-primary-foreground px-4 py-2 font-semibold animate-pulse`}>
                  {phaseConfig[phase].label}
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Press and hold the button below to ask banking-related questions. I can help with cheque withdrawals, account info, and more!
              </p>
            </div>
          )}
        </div>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onMouseDown={handleMicPress}
            onMouseUp={handleMicRelease}
            onMouseLeave={handleMicRelease}
            onTouchStart={handleMicPress}
            onTouchEnd={handleMicRelease}
            onClick={() => !isOpen && setIsOpen(true)}
            className={`border-0 rounded-full w-16 h-16 flex items-center justify-center transition-all shadow-lg font-bold ${
              isOpen
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/90 hover:to-secondary text-secondary-foreground'
            } ${isRecording ? 'scale-110 shadow-xl ring-4 ring-secondary/50' : 'hover:shadow-xl'}`}
          >
            <MicVocal size={28} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="mr-2">
          <p>Banking Support (Press & Hold)</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export default SupportBot