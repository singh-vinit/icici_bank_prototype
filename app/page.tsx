"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { supabase } from "@/lib/supabase";
import type { Phase, User, Transfer } from "@/types";

const phaseConfig: Record<
  Phase,
  {
    label: string;
    variant: "secondary" | "destructive" | "default" | "outline";
  }
> = {
  idle: { label: "Hold mic to speak", variant: "secondary" },
  listening: { label: "Listening...", variant: "destructive" },
  thinking: { label: "Thinking...", variant: "default" },
  speaking: { label: "Speaking...", variant: "outline" },
};

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [botReply, setBotReply] = useState("");
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const { startRecording, stopRecording, isRecording } = useVoiceRecorder();

  // Fetch all users on mount
  useEffect(() => {
    supabase
      .from("users")
      .select("*")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setUsers(data);
          setActiveUser(data[0]);
        }
      });
  }, []);

  // Fetch transfer history whenever active user changes
  useEffect(() => {
    if (activeUser) fetchTransfers();
  }, [activeUser?.id]);

  const fetchTransfers = async () => {
    if (!activeUser) return;
    const { transfers } = await fetch(
      `/api/transfers?userId=${activeUser.id}`,
    ).then((r) => r.json());
    setTransfers(transfers ?? []);
  };

  const refreshActiveUser = async () => {
    if (!activeUser) return;
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", activeUser.id)
      .single();
    if (data) setActiveUser(data);
  };

  const handleMicDown = async () => {
    if (phase !== "idle" || !activeUser) return;
    await startRecording();
    setPhase("listening");
  };

  const handleMicUp = async () => {
    if (!isRecording || !activeUser) return;
    setPhase("thinking");

    const blob = await stopRecording();

    // Step 1 — Whisper STT
    const form = new FormData();
    form.append("audio", new File([blob], "voice.webm"));
    const { text } = await fetch("/api/transcribe", {
      method: "POST",
      body: form,
    }).then((r) => r.json());
    setTranscript(text);

    // Step 2 — GPT-4o intent + banking logic
    const { reply, nextPendingIntent } = await fetch("/api/banking-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        user: activeUser,
        pendingIntent,
      }),
    }).then((r) => r.json());

    setBotReply(reply);
    setPendingIntent(nextPendingIntent);

    // Step 3 — OpenAI TTS
    setPhase("speaking");
    const audioRes = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply }),
    });
    const url = URL.createObjectURL(await audioRes.blob());
    const audio = new Audio(url);
    audio.onended = async () => {
      setPhase("idle");
      await refreshActiveUser();
      await fetchTransfers();
    };
    audio.play();
  };

  if (!activeUser) {
    return (
      <main className="min-h-screen bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {/* Header */}
        <CardHeader className="flex-row items-center gap-3 pb-4">
          <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">IC</span>
          </div>
          <div>
            <p className="font-semibold text-sm">ICICI Bank</p>
            <p className="text-xs text-muted-foreground">Voice assistant</p>
          </div>
          <div className="ml-auto">
            <Select
              value={activeUser.id}
              onValueChange={(id) => {
                const u = users.find((u) => u.id === id);
                if (u) {
                  setActiveUser(u);
                  setPendingIntent(null);
                  setTranscript("");
                  setBotReply("");
                }
              }}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
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

        <CardContent className="space-y-4">
          {/* User balance card */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Avatar>
              <AvatarFallback>{activeUser.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{activeUser.name}</p>
              <p className="text-xs text-muted-foreground">
                {activeUser.account_no}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="font-semibold text-sm">
                ₹{activeUser.balance.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Phase indicator */}
          <div className="flex justify-center">
            <Badge variant={phaseConfig[phase].variant}>
              {phaseConfig[phase].label}
            </Badge>
          </div>

          {/* Mic button */}
          <div className="flex justify-center py-4">
            <Button
              size="lg"
              variant={phase === "listening" ? "destructive" : "default"}
              className="w-20 h-20 rounded-full text-2xl"
              onMouseDown={handleMicDown}
              onMouseUp={handleMicUp}
              onTouchStart={handleMicDown}
              onTouchEnd={handleMicUp}
              disabled={phase === "thinking" || phase === "speaking"}
            >
              {phase === "listening" ? "⏹" : "🎙"}
            </Button>
          </div>

          {/* Transcript bubble */}
          {transcript && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <p className="text-xs text-muted-foreground mb-1">You said</p>
              <p className="text-sm">{transcript}</p>
            </div>
          )}

          {/* Bot reply bubble */}
          {botReply && (
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
              <p className="text-xs text-muted-foreground mb-1">
                ICICI assistant
              </p>
              <p className="text-sm">{botReply}</p>
            </div>
          )}

          {/* Transfer history */}
          {transfers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                Recent transfers
              </p>
              {transfers.map((t) => {
                const isSender = t.from_user_id === activeUser.id;
                const other = isSender ? t.receiver : t.sender;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                          isSender
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                        }`}
                      >
                        {other?.initials ?? "??"}
                      </div>
                      <div>
                        <p className="text-xs font-medium">
                          {isSender
                            ? `To ${other?.name ?? "Unknown"}`
                            : `From ${other?.name ?? "Unknown"}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-semibold text-xs ${
                        isSender ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {isSender ? "−" : "+"}₹{t.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
