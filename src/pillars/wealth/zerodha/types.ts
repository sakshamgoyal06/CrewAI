/** Kite Connect v3 — read-only wealth context types. */

export type KiteEnvelope<T> = {
  status: string;
  data: T;
};

export type KiteUserProfile = {
  user_id: string;
  user_name: string;
  user_shortname?: string;
  email?: string;
  broker?: string;
};

export type KiteHolding = {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  product?: string;
};

export type KiteMfHolding = {
  tradingsymbol: string;
  fund: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  folio?: string | null;
  last_price_date?: string;
};

export type KiteMfSip = {
  sip_id: string;
  tradingsymbol: string;
  fund: string;
  status: string;
  instalment_amount: number;
  frequency: string;
  next_instalment?: string;
  completed_instalments?: number;
};

export type KiteMargins = {
  equity?: {
    net?: number;
    available?: { cash?: number; live_balance?: number };
  };
};

export type KitePortfolioSnapshot = {
  profile?: KiteUserProfile;
  holdings: KiteHolding[];
  mfHoldings: KiteMfHolding[];
  mfSips: KiteMfSip[];
  margins?: KiteMargins;
};

export type KiteSessionData = {
  access_token: string;
  user_id?: string;
  user_name?: string;
};

/** Coin MF order (read or write response). */
export type KiteMfOrder = {
  order_id: string;
  tradingsymbol: string;
  fund?: string;
  transaction_type: "BUY" | "SELL" | string;
  amount?: number;
  quantity?: number;
  status?: string;
  status_message?: string;
};

export type KiteMfOrderPlaceResult = {
  order_id: string;
};

export type KiteMfSipPlaceResult = {
  sip_id: string;
  order_id?: string;
};

export type KiteEquityOrderPlaceResult = {
  order_id: string;
};
