export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "KITCHEN";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserInput = {
  role?: "OPERATOR" | "KITCHEN";
  name: string;
  username: string;
  email: string;
  password?: string;
};
