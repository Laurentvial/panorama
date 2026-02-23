// User types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  profilePhoto?: string;
  phone?: string;
  role: string;
  teamId: string | null;
  teamName?: string | null;
  active: boolean;
}

// Team types
export interface Team {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

// Team member types
export interface TeamMemberUserData {
  firstName: string;
  lastName: string;
  role: string;
}

export interface TeamMember {
  userId: string;
  userData: TeamMemberUserData;
  isLeader?: boolean;
  createdAt?: string;
}

export interface TeamDetail {
  team: Team;
  members: TeamMember[];
}

// Form payload types
export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  first_name: string;
  last_name: string;
  role: string;
  teamId: string | null;
}

// Asset types
export interface Asset {
  id: string;
  type: string;
  name: string;
  reference: string;
  category?: string;
  subcategory?: string;
  default?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Client Asset types
export interface ClientAsset {
  id: string;
  clientId: string;
  asset: Asset;
  assetId: string;
  featured: boolean;
  availabilityStart?: string;  // Format: YYYY-MM-DD
  availabilityEnd?: string;    // Format: YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

