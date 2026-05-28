// Gedeelde TypeScript-types voor de EventPay API.
//
// De docs (https://docs.eventpay.be/api/v1.html) gebruiken vereenvoudigde
// veldnamen, maar de werkelijke API geeft prefixed veldnamen terug:
// product_*, sector_*, operator_*, group_*, device_*, transaction_*, etc.
// Deze types matchen de échte API-respons zoals getest op senor-snacks.

export interface Paginated<T> {
  data: T[];
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
  meta?: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
    path: string;
  };
}

// ── Wallets ────────────────────────────────────────────────
// EventPay heeft geen wallets gemaakt op deze test-omgeving, dus de exacte
// structuur is gebaseerd op de docs + intuïtieve naming. We zijn defensief.

export interface WalletGroup {
  group_id: number;
  group_name: string;
}

export interface WalletBucket {
  bucket_id?: number;
  bucket_name?: string;
  bucket_amount?: number | string;
  bucket_currency?: string;
}

export interface WalletVoucher {
  voucher_id?: number;
  voucher_name?: string;
  voucher_amount?: number | string;
}

export interface Wallet {
  wallet_id?: number;
  wallet_uid?: string;
  wallet_code?: string;
  wallet_name?: string | null;
  wallet_comment?: string | null;
  wallet_balance?: number | string;
  wallet_can_refund?: boolean;
  wallet_can_order?: boolean;
  wallet_can_topup?: boolean;
  wallet_allow_negative?: boolean;
  wallet_pin?: string | null;
  groups?: WalletGroup[];
  buckets?: WalletBucket[];
  vouchers?: WalletVoucher[];
  [key: string]: unknown;
}

export type WalletAttribute =
  | 'name'
  | 'can_refund'
  | 'comment'
  | 'allow_negative'
  | 'can_order'
  | 'can_topup'
  | 'pin'
  | 'groups';

// ── Transactiemethoden ────────────────────────────────────
export interface TransactionMethod {
  method_id: number;
  method_name: string;
  method_icon?: string;
  method_process?: string;
  method_require_comment?: boolean;
  method_visible?: boolean;
  method_bucket_weight?: number;
  method_is_blocked_from_refund?: boolean;
  method_is_blocked_from_transfer?: boolean;
  [key: string]: unknown;
}

// ── Transacties ────────────────────────────────────────────
export interface OrderDetailLine {
  detail_id?: number;
  detail_amount?: number;
  detail_item_price?: number;
  detail_item_name?: string;
  detail_item_product_vat?: number;
  detail_item_product_vat_label?: string;
  detail_item_discount?: number;
  detail_order_note?: string | null;
  detail_amount_plus?: number;
  detail_amount_min?: number;
  detail_item_total?: number;
  product_id?: number;
  categorie_id?: number;
  modifiers?: unknown;
  [key: string]: unknown;
}

export interface Transaction {
  transaction_id: number;
  transaction_uid?: string;
  parent_transaction?: number | null;
  transaction_amount?: number | string; // API geeft string
  transaction_date?: string;
  transaction_comment?: string | null;
  transaction_finished?: boolean;
  transaction_type_id?: number;
  transaction_type?: string;
  wallet_id?: number | null;
  wallet_name?: string | null;
  wallet_code?: string | null;
  operator_id?: number | null;
  operator_name?: string | null;
  method_id?: number | null;
  method_name?: string | null;
  sector_id?: number | null;
  sector_name?: string | null;
  device_id?: number | null;
  device_name?: string | null;
  ticket_id?: number | null;
  order_uid?: string | null;
  order_detail?: OrderDetailLine[];
  transaction_external_id?: string | null;
  transaction_external_status?: string | null;
  transaction_external_provider?: string | null;
  [key: string]: unknown;
}

// ── Verkoop ────────────────────────────────────────────────
export type SalesDivider =
  | 'sector'
  | 'device'
  | 'operator'
  | 'categories'
  | 'btw';

export type SalesProductFilter = 'all' | 'sales' | 'reusables';

export interface SalesRequest {
  start_date: string;
  end_date: string;
  show_products?: boolean;
  show_methods?: boolean;
  show_days?: boolean;
  show_dividers?: boolean;
  show_loop_types?: boolean;
  divider_type?: SalesDivider;
  sector_ids?: number[];
  device_ids?: number[];
  operator_ids?: number[];
  group_modifiers?: boolean;
  product_filters?: SalesProductFilter;
}

export interface SalesResponse {
  days?: Record<string, unknown>[];
  divider_type?: SalesDivider;
  loop_types?: Record<string, unknown>[];
  methods?: Record<string, unknown>[];
  data?: Record<string, unknown>[];
  [key: string]: unknown;
}

// ── Operators ──────────────────────────────────────────────
export interface Operator {
  operator_id: number;
  operator_serial?: string;
  operator_name: string;
  operator_pin?: string | null;
  operator_force_pin?: boolean;
  operator_settings?: unknown;
  roles?: Record<string, boolean>;
  groups?: OperatorGroupRef[];
  wallet_uid?: string | null;
  [key: string]: unknown;
}

export interface OperatorGroupRef {
  group_id: number;
  group_name: string;
}

export interface OperatorGroup {
  group_id: number;
  group_name: string;
  group_pin?: string | null;
  group_visible?: boolean;
  group_apps?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface OperatorSyncRequest {
  id: string | number;
  name: string;
  eventpay?: string | null;
  groups?: number[] | null;
}

// ── Stock ──────────────────────────────────────────────────
export interface StockItem {
  stock_id?: number;
  sector_id?: number;
  sector_name?: string;
  product_id?: number;
  product_name?: string;
  stock_amount?: number;
  stock_unit?: string;
  history?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ── Devices ────────────────────────────────────────────────
export interface Device {
  device_name: string;
  device_app?: string | null;
  app_version?: string | null;
  manufacturer?: string | null;
  sector_id?: number | null;
  sector_name?: string | null;
  pinned_operator_id?: number | null;
  pinned_operator_name?: string | null;
  pinned_sector_id?: number | null;
  pinned_sector_name?: string | null;
  pinned_payment_terminal_id?: number | null;
  pinned_payment_terminal_name?: string | null;
  last_battery_percent?: number | null;
  comment?: string | null;
  [key: string]: unknown;
}

// ── Identified products / reusables ───────────────────────
export interface IdentifiedProductLine {
  product_id?: number;
  product_name?: string;
  detail_amount?: number;
  quantity?: number;
  [key: string]: unknown;
}

export interface IdentifiedProductsOrder {
  ticket_date?: string;
  order_uid: string;
  payment_method?: string | number;
  method_name?: string;
  device_name?: string;
  identified_products?: IdentifiedProductLine[];
  [key: string]: unknown;
}

export interface RefundIdentifiedRequest {
  order_uid: string;
  refund: Array<{ product: number; quantity: number }>;
  idempotency_key?: string;
}

// ── Products ───────────────────────────────────────────────
export interface ProductVat {
  id: number;
  rate: number;
  label?: string;
}

export interface Product {
  product_id: number;
  product_plu?: string | null;
  product_name_internal?: string;
  product_name_external?: string;
  product_color?: string;
  product_price?: number;
  product_vat?: number;
  product_vat_id?: number;
  product_visible?: boolean;
  product_description?: string | null;
  vat?: ProductVat;
  [key: string]: unknown;
}

export interface ProductUpdate {
  product_name_internal?: string;
  product_name_external?: string;
  product_price?: number;
  product_vat?: number;
  product_color?: string;
  product_description?: string;
  product_visible?: boolean;
}

// ── Sectors & categorieën ─────────────────────────────────
export interface Sector {
  sector_id: number;
  sector_name: string;
  sector_active?: boolean;
  sector_in_app?: boolean;
  sector_mode_id?: number | null;
  is_stock_location?: boolean;
  uses_stock_location?: unknown;
  sector_comment?: string | null;
  sector_limit_groups?: unknown;
  sector_forbidden_for_methods?: number[] | null;
  sector_data?: unknown;
  [key: string]: unknown;
}

export interface Category {
  categorie_id: number;
  categorie_name: string;
  categorie_color?: string;
  categorie_order?: number | null;
  categorie_active?: boolean;
  categorie_visible?: boolean;
  categorie_forbidden_for_groups?: unknown;
  categorie_data?: unknown;
  sector_id?: number;
  products?: Product[];
  children?: Category[];
  [key: string]: unknown;
}

export interface SectorWithCategories extends Sector {
  categories?: Category[];
}

// ── Helper: amount-velden zijn soms string ────────────────
export function toNumber(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}
