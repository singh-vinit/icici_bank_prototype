import { useRef, useState } from 'react'

export function useVoiceRecorder() {
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder.current = new MediaRecorder(stream, {
      mimeType: 'audio/webm',
    })
    chunks.current = []
    mediaRecorder.current.ondataavailable = (e) => {
      chunks.current.push(e.data)
    }
    mediaRecorder.current.start()
    setIsRecording(true)
  }

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      mediaRecorder.current!.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop())
        resolve(blob)
      }
      mediaRecorder.current!.stop()
      setIsRecording(false)
    })
  }

  return { startRecording, stopRecording, isRecording }
}
