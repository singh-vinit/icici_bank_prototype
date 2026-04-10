import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript = body?.transcript?.trim();

    if (!transcript || transcript.length === 0) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are ICICI Bank's Support AI Assistant. You answer ONLY general banking-related questions.

ALLOWED TOPICS:
- Cheque withdrawal procedures and timelines
- Self-cheque withdrawal policies
- Account types and features
- Deposit/withdrawal procedures
- Interest rates
- KYC requirements
- Transaction limits
- Bank holidays and working hours
- General ICICI Bank policies

DENIED TOPICS:
- Account balance or personal financial information
- Fund transfers or payments
- Loan applications
- Investment advice
- Credit card applications
- Technical support for apps/websites

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "isValidBankingQuery": true or false,
  "reply": "<natural spoken answer, 25-60 words, or rejection message if not banking-related>"
}

Rules:
- Be helpful and professional
- Keep replies conversational and spoken naturally
- Max 60 words per response
- If asked about forbidden topics, politely redirect to general banking info
- If the query is not banking-related, set isValidBankingQuery to false and explain you only help with banking questions
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 500 }
      );
    }

    const result = JSON.parse(content);

    return NextResponse.json({
      isValidBankingQuery: result.isValidBankingQuery,
      reply: result.reply,
      transcript: transcript,
    });
  } catch (err) {
    console.error("Support AI error:", err);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 }
    );
  }
}
