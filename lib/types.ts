export type UserRole = "user" | "schlichter";

export type BookingStatus =
  | "angefragt"
  | "bestaetigt"
  | "klaerung"
  | "storniert"
  | "abgelehnt";

export type FamilyParty = {
  id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  family_party_id: string | null;
  role: UserRole;
  created_at: string;
  family_parties?: FamilyParty | null;
};

export type Booking = {
  id: string;
  family_party_id: string;
  created_by: string;
  start_date: string;
  end_date: string;
  is_priority: boolean;
  shared_stay_allowed: boolean;
  status: BookingStatus;
  comment: string | null;
  notice_period_ends_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  family_parties?: FamilyParty | null;
  profiles?: Profile | null;
};

export type Objection = {
  id: string;
  booking_id: string;
  created_by: string;
  reason: string;
  created_at: string;
  profiles?: Profile | null;
};

export type BookingEvent = {
  id: string;
  booking_id: string;
  event_type: string;
  message: string;
  created_by: string | null;
  created_at: string;
};
