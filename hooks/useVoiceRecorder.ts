import { useRef, useState } from 'react'

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function useVoiceRecorder() {
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const mimeType = useRef<string>('')
  const startTime = useRef<number>(0)
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mimeType.current = getSupportedMimeType()
    mediaRecorder.current = new MediaRecorder(
      stream,
      mimeType.current ? { mimeType: mimeType.current } : undefined
    )
    chunks.current = []
    startTime.current = Date.now()
    mediaRecorder.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    mediaRecorder.current.start()
    setIsRecording(true)
  }

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const elapsed = Date.now() - startTime.current

      // If held for less than 500ms, cancel and return null
      if (elapsed < 500) {
        mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop())
        mediaRecorder.current = null
        setIsRecording(false)
        resolve(null)
        return
      }

      mediaRecorder.current!.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: mimeType.current || 'audio/webm',
        })
        mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop())
        resolve(blob)
      }
      mediaRecorder.current!.stop()
      setIsRecording(false)
    })
  }

  return { startRecording, stopRecording, isRecording }
}