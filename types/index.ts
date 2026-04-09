export type Phase = "idle" | "listening" | "thinking" | "speaking";

export type User = {
  id: string;
  name: string;
  initials: string;
  pin: string;
  balance: number;
  fd: number;
  account_no: string;
};

export type BankingResponse = {
  reply: string;
  nextPendingIntent: string | null;
  updatedBalance?: number;
};

export type Transfer = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  sender?: { name: string; initials: string };
  receiver?: { name: string; initials: string };
};
