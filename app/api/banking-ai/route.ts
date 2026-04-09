import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { transcript, user, pendingIntent } = await req.json();

    // Fetch all users from Supabase
    const { data: allUsers, error: fetchError } = await supabase
      .from("users")
      .select("*");

    if (fetchError || !allUsers) {
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 },
      );
    }

    const others = allUsers
      .filter((u) => u.id !== user.id)
      .map((u) => u.name)
      .join(", ");

    const systemPrompt = `
You are ICICI Bank's voice assistant. Speak naturally and briefly.
Logged-in user: ${user.name}
Account balance: ₹${user.balance}
FD balance: ₹${user.fd}
Total savings: ₹${user.balance + user.fd}
Can transfer to: ${others}
Current pending intent: ${pendingIntent ?? "none"}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "intent": "CHECK_BALANCE | CHECK_FD | TOTAL_SAVINGS | TRANSFER_INIT | TRANSFER_CONFIRM | TRANSFER_HISTORY | UNKNOWN",
  "toUser": "<recipient name or null>",
  "amount": <number or null>,
  "reply": "<natural spoken reply, under 25 words>",
  "nextPendingIntent": "<string or null>"
}

Rules:
- CHECK_BALANCE: reply with exact account balance
- CHECK_FD: reply with FD balance
- TOTAL_SAVINGS: reply with balance + FD combined
- TRANSFER_INIT: user wants to transfer, ask recipient and amount step by step
- TRANSFER_CONFIRM: you have both toUser and amount confirmed, say transfer is done
- TRANSFER_HISTORY: user asks about past transfers, reply with a summary
- Keep replies short and spoken naturally — no bullet points
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content!);

    // Handle transfer confirmation
    if (
      result.intent === "TRANSFER_CONFIRM" &&
      result.toUser &&
      result.amount
    ) {
      const receiver = allUsers.find((u) =>
        u.name.toLowerCase().includes(result.toUser.toLowerCase()),
      );

      if (receiver && user.balance >= result.amount) {
        // 1. Debit sender
        await supabase
          .from("users")
          .update({ balance: user.balance - result.amount })
          .eq("id", user.id);

        // 2. Credit receiver
        await supabase
          .from("users")
          .update({ balance: receiver.balance + result.amount })
          .eq("id", receiver.id);

        // 3. Record transfer history
        await supabase.from("transfers").insert({
          from_user_id: user.id,
          to_user_id: receiver.id,
          amount: result.amount,
          note: `Voice transfer to ${receiver.name}`,
        });
      } else if (receiver && user.balance < result.amount) {
        result.reply = `Sorry, you don't have enough balance for this transfer.`;
        result.nextPendingIntent = null;
      }
    }

    // Handle transfer history request
    if (result.intent === "TRANSFER_HISTORY") {
      const { data: history } = await supabase
        .from("transfers")
        .select(`*, sender:from_user_id(name), receiver:to_user_id(name)`)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(3);

      if (history && history.length > 0) {
        const latest = history[0];
        const isSender = latest.from_user_id === user.id;
        const date = new Date(latest.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        });
        result.reply = `Your last transfer was ₹${latest.amount.toLocaleString("en-IN")} ${
          isSender ? `to ${latest.receiver.name}` : `from ${latest.sender.name}`
        } on ${date}.`;
      } else {
        result.reply = `You have no transfer history yet.`;
      }
    }

    return NextResponse.json({
      reply: result.reply,
      nextPendingIntent: result.nextPendingIntent ?? null,
    });
  } catch (err) {
    console.error("Banking AI error:", err);
    return NextResponse.json(
      { error: "AI processing failed" },
      { status: 500 },
    );
  }
}
