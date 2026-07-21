export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt?: string;
  gmailConnected?: boolean;
  expenseAutomationEnabled?: boolean;
}
